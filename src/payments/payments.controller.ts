import { Controller, Get, Post, Body, Query, Param, UseGuards, Logger, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaymentMethod } from '@prisma/client';

class RecordPaymentDto {
  method: PaymentMethod;
}

@ApiTags('Pagamentos')
@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('ride/:rideId/record')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Registra método de pagamento usado na corrida',
    description: 'Registra que o pagamento foi feito diretamente do passageiro para o motorista',
  })
  async recordRidePayment(
    @Param('rideId') rideId: string,
    @Body() dto: RecordPaymentDto,
  ) {
    const payment = await this.paymentsService.recordRidePayment(rideId, dto.method);

    return {
      success: true,
      data: payment,
      message: 'Pagamento registrado com sucesso',
    };
  }

  @Get('history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Histórico de pagamentos do usuário',
    description: 'Retorna o histórico de pagamentos de corridas',
  })
  async getPaymentHistory(
    @Request() req,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('method') method?: PaymentMethod,
  ) {
    const filters: any = {};

    if (startDate) {
      filters.startDate = new Date(startDate);
    }
    if (endDate) {
      filters.endDate = new Date(endDate);
    }
    if (method) {
      filters.method = method;
    }

    const payments = await this.paymentsService.getPaymentHistory(req.user.id, filters);

    return {
      success: true,
      data: payments,
      total: payments.length,
    };
  }

  @Get('methods')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Métodos de pagamento disponíveis',
    description: 'Retorna métodos de pagamento offline (presencial)',
  })
  async getPaymentMethods() {
    const methods = await this.paymentsService.getPaymentMethods();

    return {
      success: true,
      data: methods,
    };
  }

  @Get('wallet/balance')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Saldo da carteira (deprecated)',
    description: 'Retorna sempre 0 - sistema agora usa apenas pagamentos offline',
  })
  async getWalletBalance(@Request() req) {
    return {
      success: true,
      data: {
        balance: 0,
        userId: req.user.id,
      },
    };
  }

  @Get('driver/statistics')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Estatísticas de ganhos do motorista',
    description: 'Retorna estatísticas de ganhos por período',
  })
  async getDriverStatistics(
    @Request() req,
    @Query('period') period: 'day' | 'week' | 'month' = 'week',
  ) {
    const driver = await this.getDriverFromUser(req.user.id);
    const statistics = await this.paymentsService.getPaymentStatistics(driver.id, period);

    return {
      success: true,
      data: statistics,
    };
  }

  private async getDriverFromUser(userId: string) {
    const driver = await this.paymentsService['prisma'].driver.findUnique({
      where: { userId },
    });

    if (!driver) {
      throw new Error('Motorista não encontrado');
    }

    return driver;
  }
}
