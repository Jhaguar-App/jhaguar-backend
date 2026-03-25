import { Controller, Get, Query, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';

@ApiTags('Admin - Payments')
@Controller('payments/admin')
export class PaymentsAdminController {
  private readonly logger = new Logger(PaymentsAdminController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('statistics')
  @ApiOperation({ summary: 'Estatísticas globais de pagamentos' })
  async getGlobalStatistics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const filters: any = {};

    if (startDate) {
      filters.startDate = new Date(startDate);
    }
    if (endDate) {
      filters.endDate = new Date(endDate);
    }

    const statistics = await this.paymentsService.getGlobalStatistics(filters);

    return {
      success: true,
      data: statistics,
    };
  }

  @Get('reports')
  @ApiOperation({ summary: 'Relatório de pagamentos por período' })
  async getPaymentReports(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('driverId') driverId?: string,
  ) {
    const filters = {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      driverId,
    };

    const report = await this.paymentsService.generateReport(filters);

    return {
      success: true,
      data: report,
    };
  }
}
