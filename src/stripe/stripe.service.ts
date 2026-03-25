import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe;
  private readonly isTestMode: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const stripeKey = this.configService.get<string>('STRIPE_SECRET_KEY');

    if (!stripeKey) {
      throw new Error('STRIPE_SECRET_KEY não configurada');
    }

    this.isTestMode = stripeKey.includes('sk_test_');
    this.stripe = new Stripe(stripeKey, {
      apiVersion: '2022-11-15',
    });

    this.logger.log(
      `StripeService iniciado - Modo: ${
        this.isTestMode ? 'TESTE' : 'PRODUÇÃO'
      }`,
    );
  }

  async createPaymentIntent(createPaymentDto: CreatePaymentIntentDto) {
    try {
      const { name, email, amount } = createPaymentDto;

      // Converter para centavos (Stripe usa centavos)
      const amountInCents = Math.round(parseFloat(amount) * 100);

      if (amountInCents < 50) {
        // Mínimo R$ 0,50
        throw new BadRequestException('Valor mínimo é R$ 0,50');
      }

      if (amountInCents > 100000) {
        // Máximo R$ 1.000,00
        throw new BadRequestException('Valor máximo é R$ 1.000,00');
      }

      // Buscar ou criar cliente no Stripe
      const customer = await this.getOrCreateCustomer(email, name);

      // Criar PaymentIntent
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: amountInCents,
        currency: 'brl',
        customer: customer.id,
        description: `Adição de saldo - ${name}`,
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          type: 'wallet_topup',
          customer_email: email,
          customer_name: name,
          original_amount: amount,
        },
      });

      // Criar chave efêmera para o cliente
      const ephemeralKey = await this.stripe.ephemeralKeys.create(
        { customer: customer.id },
        { apiVersion: '2025-06-30.basil' },
      );

      this.logger.log(
        `PaymentIntent criado: ${paymentIntent.id} - R$ ${amount} para ${email}`,
      );

      return {
        paymentIntent: {
          id: paymentIntent.id,
          client_secret: paymentIntent.client_secret,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          status: paymentIntent.status,
        },
        ephemeralKey: {
          id: ephemeralKey.id,
          secret: ephemeralKey.secret,
        },
        customer: customer.id,
        publishableKey: this.configService.get<string>(
          'STRIPE_PUBLISHABLE_KEY',
        ),
      };
    } catch (error) {
      this.logger.error('Erro ao criar PaymentIntent:', error);

      // Tratar erros específicos do Stripe
      if (error.type === 'StripeCardError') {
        throw new BadRequestException(`Erro no cartão: ${error.message}`);
      } else if (error.type === 'StripeInvalidRequestError') {
        throw new BadRequestException(`Requisição inválida: ${error.message}`);
      } else if (error.type === 'StripeAPIError') {
        throw new BadRequestException(
          `Erro na API do Stripe: ${error.message}`,
        );
      } else if (error.type === 'StripeConnectionError') {
        throw new BadRequestException(
          `Erro de conexão com Stripe: ${error.message}`,
        );
      } else if (error.type === 'StripeAuthenticationError') {
        throw new BadRequestException(
          `Erro de autenticação Stripe: ${error.message}`,
        );
      } else {
        throw new BadRequestException(
          error instanceof Error
            ? error.message
            : 'Erro desconhecido no Stripe',
        );
      }
    }
  }

  async confirmPayment(paymentIntentId: string, userId: string) {
    try {
      // Buscar o PaymentIntent no Stripe
      const paymentIntent = await this.stripe.paymentIntents.retrieve(
        paymentIntentId,
      );

      // Verificar se o pagamento foi processado com sucesso ou está processando
      const validStatuses = ['succeeded', 'processing', 'requires_capture'];
      if (!validStatuses.includes(paymentIntent.status)) {
        throw new BadRequestException(
          `Pagamento não foi bem-sucedido. Status: ${paymentIntent.status}`,
        );
      }

      // Se ainda está processando, aguardar um pouco
      if (paymentIntent.status === 'processing') {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const updatedPaymentIntent = await this.stripe.paymentIntents.retrieve(
          paymentIntentId,
        );
        if (!validStatuses.includes(updatedPaymentIntent.status)) {
          throw new BadRequestException(
            `Pagamento não foi concluído. Status final: ${updatedPaymentIntent.status}`,
          );
        }
      }

      // Processar a adição de saldo
      const amount = paymentIntent.amount / 100; // Converter de centavos para reais

      // Buscar usuário e carteira
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { UserWallet: true },
      });

      if (!user) {
        throw new NotFoundException('Usuário não encontrado');
      }

      // Criar ou buscar carteira
      let wallet = user.UserWallet;
      if (!wallet) {
        wallet = await this.prisma.userWallet.create({
          data: {
            userId,
            balance: 0.0,
          },
        });
      }

      // Verificar se já processamos este pagamento
      const existingTransaction = await this.prisma.transaction.findFirst({
        where: {
          stripePaymentIntentId: paymentIntentId,
          type: 'WALLET_TOPUP',
        },
      });

      if (existingTransaction) {
        throw new BadRequestException(
          'Este pagamento já foi processado anteriormente',
        );
      }

      // Atualizar saldo da carteira
      const updatedWallet = await this.prisma.userWallet.update({
        where: { id: wallet.id },
        data: {
          balance: wallet.balance + amount,
        },
      });

      // Criar transação
      const transaction = await this.prisma.transaction.create({
        data: {
          userId,
          walletId: wallet.id,
          type: 'WALLET_TOPUP',
          status: 'COMPLETED',
          amount,
          description: `Adição de saldo via Stripe`,
          stripePaymentIntentId: paymentIntentId,
          stripeCustomerId: paymentIntent.customer as string,
          metadata: {
            paymentMethod: 'CREDIT_CARD',
            stripePaymentIntentId: paymentIntentId,
            originalAmount: amount,
          },
          processedAt: new Date(),
        },
      });

      this.logger.log(
        `Saldo adicionado via Stripe: R$ ${amount} para usuário ${userId}. Novo saldo: R$ ${updatedWallet.balance}`,
      );

      return {
        transactionId: transaction.id,
        amount,
        newBalance: updatedWallet.balance,
        paymentIntentId,
        status: 'COMPLETED',
      };
    } catch (error) {
      this.logger.error('Erro ao confirmar pagamento:', error);
      throw error;
    }
  }

  private async getOrCreateCustomer(
    email: string,
    name: string,
  ): Promise<Stripe.Customer> {
    try {
      // Buscar cliente existente por email
      const existingCustomers = await this.stripe.customers.list({
        email,
        limit: 1,
      });

      if (existingCustomers.data.length > 0) {
        return existingCustomers.data[0];
      }

      // Criar novo cliente
      const customer = await this.stripe.customers.create({
        email,
        name,
        metadata: {
          source: 'ride-sharing-app',
          created_at: new Date().toISOString(),
        },
      });

      this.logger.log(`Cliente Stripe criado: ${customer.id} - ${email}`);
      return customer;
    } catch (error) {
      this.logger.error('Erro ao buscar/criar cliente Stripe:', error);
      throw error;
    }
  }

  async handleWebhook(signature: string, payload: Buffer): Promise<void> {
    try {
      const webhookSecret = this.configService.get<string>(
        'STRIPE_WEBHOOK_SECRET',
      );

      if (!webhookSecret) {
        throw new Error('STRIPE_WEBHOOK_SECRET não configurado');
      }

      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret,
      );

      this.logger.log(`Webhook recebido: ${event.type} - ${event.id}`);

      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentSuccess(
            event.data.object as unknown as Stripe.PaymentIntent,
          );
          break;

        case 'payment_intent.payment_failed':
          await this.handlePaymentFailure(
            event.data.object as unknown as Stripe.PaymentIntent,
          );
          break;

        case 'payment_intent.canceled':
          await this.handlePaymentCanceled(
            event.data.object as unknown as Stripe.PaymentIntent,
          );
          break;

        default:
          this.logger.log(`Evento não tratado: ${event.type}`);
      }
    } catch (error) {
      this.logger.error('Erro ao processar webhook:', error);
      throw error;
    }
  }

  private async handlePaymentSuccess(
    paymentIntent: Stripe.PaymentIntent,
  ): Promise<void> {
    try {
      this.logger.log(
        `Pagamento Stripe bem-sucedido: ${paymentIntent.id}`,
      );
      this.logger.warn(
        `Assinaturas agora são processadas via ASAAS. PaymentIntent: ${paymentIntent.id}`,
      );
    } catch (error) {
      this.logger.error('Erro ao processar sucesso do pagamento:', error);
    }
  }

  private async handlePaymentFailure(
    paymentIntent: Stripe.PaymentIntent,
  ): Promise<void> {
    try {
      // Buscar transação pendente
      const transaction = await this.prisma.transaction.findFirst({
        where: {
          stripePaymentIntentId: paymentIntent.id,
          status: 'PENDING',
        },
      });

      if (transaction) {
        await this.prisma.transaction.update({
          where: { id: transaction.id },
          data: {
            status: 'FAILED',
            failureReason:
              paymentIntent.last_payment_error?.message || 'Falha no pagamento',
            processedAt: new Date(),
          },
        });

        this.logger.warn(
          `Pagamento falhou via webhook: ${paymentIntent.id} - ${paymentIntent.last_payment_error?.message}`,
        );
      }
    } catch (error) {
      this.logger.error('Erro ao processar falha do pagamento:', error);
    }
  }

  private async handlePaymentCanceled(
    paymentIntent: Stripe.PaymentIntent,
  ): Promise<void> {
    try {
      const transaction = await this.prisma.transaction.findFirst({
        where: {
          stripePaymentIntentId: paymentIntent.id,
          status: 'PENDING',
        },
      });

      if (transaction) {
        await this.prisma.transaction.update({
          where: { id: transaction.id },
          data: {
            status: 'CANCELLLED',
            failureReason: 'Pagamento cancelado pelo usuário',
            processedAt: new Date(),
          },
        });

        this.logger.log(`Pagamento cancelado: ${paymentIntent.id}`);
      }
    } catch (error) {
      this.logger.error('Erro ao processar cancelamento:', error);
    }
  }

  // Método auxiliar para obter cartões de teste
  getTestCards() {
    if (!this.isTestMode) {
      return null;
    }

    return {
      success: '4242424242424242',
      decline: '4000000000000002',
      insufficient_funds: '4000000000009995',
      expired: '4000000000000069',
      cvc_fail: '4000000000000127',
      processing_error: '4000000000000119',
    };
  }
}
