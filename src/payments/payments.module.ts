import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsAdminController } from './admin.controller';
import { PaymentsService } from './payments.service';

@Module({
  controllers: [
    PaymentsController,
    PaymentsAdminController,
  ],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
