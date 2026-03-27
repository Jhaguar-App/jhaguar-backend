import { Module, Global, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AsaasService } from './asaas.service';
import { AsaasController } from './asaas.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Global()
@Module({
  imports: [ConfigModule, PrismaModule, forwardRef(() => SubscriptionsModule)],
  controllers: [AsaasController],
  providers: [AsaasService],
  exports: [AsaasService],
})
export class AsaasModule {}
