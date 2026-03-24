import {
  Controller,
  Post,
  Body,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CreateChargeDto } from './dto';
import { AsaasService } from './asaas.service';
import { AsaasWebhookEvent } from './interfaces/asaas.interfaces';

@ApiTags('ASAAS')
@Controller('asaas')
export class AsaasController {
  private readonly logger = new Logger(AsaasController.name);

  constructor(private readonly asaasService: AsaasService) {}

  @Post('create')
  @ApiOperation({
    summary: 'Criar cobrança para adicionar saldo',
    description: 'Cria uma cobrança no ASAAS para adicionar saldo à carteira',
  })
  @ApiResponse({
    status: 200,
    description: 'Cobrança criada com sucesso',
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos',
  })
  async createCharge(@Body() createChargeDto: CreateChargeDto) {
    try {
      this.logger.log(
        `Criando cobrança ASAAS para ${createChargeDto.name} - R$ ${createChargeDto.value}`,
      );

      const result = await this.asaasService.createCharge(createChargeDto);

      return {
        success: true,
        data: {
          chargeId: result.charge.id,
          value: result.charge.value,
          status: result.charge.status,
          billingType: result.charge.billingType,
          dueDate: result.charge.dueDate,
          invoiceUrl: result.charge.invoiceUrl,
          bankSlipUrl: result.charge.bankSlipUrl,
          pixQrCode: result.pixQrCode,
        },
        message: 'Cobrança criada com sucesso',
      };
    } catch (error) {
      this.logger.error('Erro ao criar cobrança:', error);

      if (error instanceof Error) {
        this.logger.error('Stack trace:', error.stack);
        return {
          success: false,
          message: error.message,
          data: null,
        };
      }

      return {
        success: false,
        message: 'Erro desconhecido ao criar cobrança',
        data: null,
      };
    }
  }

  @Post('confirm-payment')
  @ApiOperation({
    summary: 'Confirmar pagamento processado',
    description: 'Confirma que um pagamento foi processado com sucesso',
  })
  async confirmPayment(@Body() body: { chargeId: string; userId: string }) {
    try {
      const result = await this.asaasService.confirmPayment(
        body.chargeId,
        body.userId,
      );

      return {
        success: true,
        data: result,
        message: 'Pagamento confirmado com sucesso',
      };
    } catch (error) {
      this.logger.error('Erro ao confirmar pagamento:', error);
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Erro ao confirmar pagamento',
      );
    }
  }

  @Post('webhook')
  @ApiOperation({
    summary: 'Webhook do ASAAS',
    description: 'Endpoint para receber eventos do ASAAS',
  })
  async handleWebhook(@Body() event: AsaasWebhookEvent) {
    try {
      this.logger.log(`Webhook recebido: ${event.event}`);

      await this.asaasService.handleWebhook(event);

      return { received: true };
    } catch (error) {
      this.logger.error('Erro ao processar webhook:', error);
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Erro ao processar webhook',
      );
    }
  }
}
