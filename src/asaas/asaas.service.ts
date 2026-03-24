import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChargeDto, CreditCardPaymentDto } from './dto';
import {
  AsaasCharge,
  AsaasCustomer,
  AsaasPixQrCode,
  AsaasWebhookEvent,
  AsaasChargeStatus,
  AsaasBillingType,
  AsaasErrorResponse,
} from './interfaces/asaas.interfaces';

@Injectable()
export class AsaasService {
  private readonly logger = new Logger(AsaasService.name);
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly isProduction: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const apiKey = this.configService.get<string>('ASAAS_API_KEY');

    if (!apiKey) {
      throw new Error('ASAAS_API_KEY não configurada');
    }

    this.apiKey = apiKey;
    this.isProduction = this.apiKey.includes('$aact_prod_');
    this.apiUrl = this.isProduction
      ? 'https://api.asaas.com/v3'
      : 'https://sandbox.asaas.com/api/v3';

    this.logger.log(
      `AsaasService iniciado - Modo: ${this.isProduction ? 'PRODUÇÃO' : 'SANDBOX'}`,
    );
  }

  private async makeRequest<T>(
    method: string,
    endpoint: string,
    data?: any,
  ): Promise<T> {
    const url = `${this.apiUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          access_token: this.apiKey,
        },
        body: data ? JSON.stringify(data) : undefined,
      });

      const responseData = await response.json();

      if (!response.ok) {
        const errorResponse = responseData as AsaasErrorResponse;
        const errorMessage = errorResponse.errors
          ?.map((e) => e.description)
          .join(', ') || 'Erro desconhecido no ASAAS';
        throw new BadRequestException(errorMessage);
      }

      return responseData as T;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Erro na requisição ASAAS: ${error.message}`, error.stack);
      throw new BadRequestException('Erro ao comunicar com ASAAS');
    }
  }

  async createOrGetCustomer(
    name: string,
    email: string,
    cpfCnpj?: string,
    phone?: string,
  ): Promise<AsaasCustomer> {
    try {
      const searchParams = new URLSearchParams({ email });
      const existingCustomers = await this.makeRequest<{ data: AsaasCustomer[] }>(
        'GET',
        `/customers?${searchParams.toString()}`,
      );

      if (existingCustomers.data && existingCustomers.data.length > 0) {
        this.logger.log(`Cliente ASAAS encontrado: ${existingCustomers.data[0].id}`);
        return existingCustomers.data[0];
      }

      const customer = await this.makeRequest<AsaasCustomer>('POST', '/customers', {
        name,
        email,
        cpfCnpj,
        mobilePhone: phone,
      });

      this.logger.log(`Cliente ASAAS criado: ${customer.id} - ${email}`);
      return customer;
    } catch (error) {
      this.logger.error('Erro ao buscar/criar cliente ASAAS:', error);
      throw error;
    }
  }

  async createCharge(dto: CreateChargeDto): Promise<{
    charge: AsaasCharge;
    pixQrCode?: AsaasPixQrCode;
  }> {
    try {
      if (dto.value < 5) {
        throw new BadRequestException('Valor mínimo é R$ 5,00');
      }

      const customer = await this.createOrGetCustomer(
        dto.name,
        dto.email,
        dto.cpfCnpj,
        dto.phone,
      );

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 1);

      const chargeData = {
        customer: customer.id,
        billingType: dto.billingType,
        value: dto.value,
        dueDate: dueDate.toISOString().split('T')[0],
        description: dto.description || 'Pagamento de assinatura',
        externalReference: dto.externalReference,
      };

      const charge = await this.makeRequest<AsaasCharge>('POST', '/payments', chargeData);

      this.logger.log(
        `Cobrança ASAAS criada: ${charge.id} - R$ ${dto.value} (${dto.billingType})`,
      );

      let pixQrCode: AsaasPixQrCode | undefined;
      if (dto.billingType === AsaasBillingType.PIX) {
        pixQrCode = await this.getPixQrCode(charge.id);
      }

      return { charge, pixQrCode };
    } catch (error) {
      this.logger.error('Erro ao criar cobrança:', error);
      throw error;
    }
  }

  async payWithCreditCard(
    chargeId: string,
    creditCard: CreditCardPaymentDto,
  ): Promise<AsaasCharge> {
    try {
      const creditCardData = {
        creditCard: {
          holderName: creditCard.holderName,
          number: creditCard.cardNumber,
          expiryMonth: creditCard.expiryMonth,
          expiryYear: creditCard.expiryYear,
          ccv: creditCard.cvv,
        },
        creditCardHolderInfo: {
          name: creditCard.holderName,
          cpfCnpj: creditCard.cpfCnpj,
          postalCode: creditCard.postalCode,
          addressNumber: creditCard.addressNumber,
          phone: creditCard.phone,
        },
      };

      const charge = await this.makeRequest<AsaasCharge>(
        'POST',
        `/payments/${chargeId}/payWithCreditCard`,
        creditCardData,
      );

      this.logger.log(
        `Pagamento com cartão processado: ${chargeId} - Status: ${charge.status}`,
      );

      return charge;
    } catch (error) {
      this.logger.error('Erro ao processar pagamento com cartão:', error);
      throw error;
    }
  }

  async getPixQrCode(chargeId: string): Promise<AsaasPixQrCode> {
    try {
      const pixQrCode = await this.makeRequest<AsaasPixQrCode>(
        'GET',
        `/payments/${chargeId}/pixQrCode`,
      );

      this.logger.log(`QR Code PIX gerado para cobrança: ${chargeId}`);
      return pixQrCode;
    } catch (error) {
      this.logger.error('Erro ao gerar QR Code PIX:', error);
      throw error;
    }
  }

  async getCharge(chargeId: string): Promise<AsaasCharge> {
    try {
      const charge = await this.makeRequest<AsaasCharge>(
        'GET',
        `/payments/${chargeId}`,
      );
      return charge;
    } catch (error) {
      this.logger.error(`Erro ao buscar cobrança ${chargeId}:`, error);
      throw new NotFoundException('Cobrança não encontrada');
    }
  }

  async confirmPayment(chargeId: string, userId: string) {
    try {
      const charge = await this.getCharge(chargeId);

      const validStatuses: AsaasChargeStatus[] = [
        AsaasChargeStatus.RECEIVED,
        AsaasChargeStatus.CONFIRMED,
        AsaasChargeStatus.RECEIVED_IN_CASH,
      ];

      if (!validStatuses.includes(charge.status)) {
        throw new BadRequestException(
          `Pagamento não foi confirmado. Status: ${charge.status}`,
        );
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { UserWallet: true },
      });

      if (!user) {
        throw new NotFoundException('Usuário não encontrado');
      }

      let wallet = user.UserWallet;
      if (!wallet) {
        wallet = await this.prisma.userWallet.create({
          data: {
            userId,
            balance: 0.0,
          },
        });
      }

      const existingTransaction = await this.prisma.transaction.findFirst({
        where: {
          stripePaymentIntentId: chargeId,
          type: 'WALLET_TOPUP',
        },
      });

      if (existingTransaction) {
        throw new BadRequestException('Este pagamento já foi processado anteriormente');
      }

      const updatedWallet = await this.prisma.userWallet.update({
        where: { id: wallet.id },
        data: {
          balance: wallet.balance + charge.value,
        },
      });

      const transaction = await this.prisma.transaction.create({
        data: {
          userId,
          walletId: wallet.id,
          type: 'WALLET_TOPUP',
          status: 'COMPLETED',
          amount: charge.value,
          description: `Adição de saldo via ASAAS`,
          stripePaymentIntentId: chargeId,
          stripeCustomerId: charge.customer,
          metadata: {
            paymentMethod: charge.billingType,
            asaasChargeId: chargeId,
            originalAmount: charge.value,
          },
          processedAt: new Date(),
        },
      });

      this.logger.log(
        `Saldo adicionado via ASAAS: R$ ${charge.value} para usuário ${userId}. Novo saldo: R$ ${updatedWallet.balance}`,
      );

      return {
        transactionId: transaction.id,
        amount: charge.value,
        newBalance: updatedWallet.balance,
        chargeId,
        status: 'COMPLETED',
      };
    } catch (error) {
      this.logger.error('Erro ao confirmar pagamento:', error);
      throw error;
    }
  }

  async handleWebhook(event: AsaasWebhookEvent): Promise<void> {
    try {
      this.logger.log(`Webhook ASAAS recebido: ${event.event} - ${event.payment.id}`);

      switch (event.event) {
        case 'PAYMENT_RECEIVED':
        case 'PAYMENT_CONFIRMED':
          await this.handlePaymentSuccess(event.payment);
          break;

        case 'PAYMENT_OVERDUE':
        case 'PAYMENT_DELETED':
          await this.handlePaymentFailure(event.payment);
          break;

        default:
          this.logger.log(`Evento não tratado: ${event.event}`);
      }
    } catch (error) {
      this.logger.error('Erro ao processar webhook:', error);
      throw error;
    }
  }

  private async handlePaymentSuccess(payment: any): Promise<void> {
    try {
      const subscription = await this.prisma.driverSubscription.findFirst({
        where: {
          paymentIntentId: payment.id,
          status: 'PENDING_PAYMENT',
        },
      });

      if (subscription) {
        this.logger.log(`Confirmando pagamento de plano: ${payment.id}`);

        const subscriptionsService = await import(
          '../subscriptions/subscriptions.service'
        ).then((m) => new m.SubscriptionsService(this.prisma, this));

        await subscriptionsService.confirmPlanPayment(payment.id);

        this.logger.log(`Plano ativado via webhook: ${payment.id}`);
        return;
      }

      this.logger.warn(`Nenhuma assinatura encontrada para pagamento: ${payment.id}`);
    } catch (error) {
      this.logger.error('Erro ao processar sucesso do pagamento:', error);
    }
  }

  private async handlePaymentFailure(payment: any): Promise<void> {
    try {
      const transaction = await this.prisma.transaction.findFirst({
        where: {
          stripePaymentIntentId: payment.id,
          status: 'PENDING',
        },
      });

      if (transaction) {
        await this.prisma.transaction.update({
          where: { id: transaction.id },
          data: {
            status: 'FAILED',
            failureReason: 'Pagamento vencido ou deletado',
            processedAt: new Date(),
          },
        });

        this.logger.warn(`Pagamento falhou via webhook: ${payment.id}`);
      }
    } catch (error) {
      this.logger.error('Erro ao processar falha do pagamento:', error);
    }
  }
}
