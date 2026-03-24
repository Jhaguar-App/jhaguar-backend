import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';
import { AdminSubscriptionsController } from './admin-subscriptions.controller';
import { ActiveSubscriptionGuard } from './guards/active-subscription.guard';
import { SubscriptionExpiryJob } from './jobs/subscription-expiry.job';
import { PrismaModule } from '../prisma/prisma.module';
import { StripeModule } from '../stripe/stripe.module';

@Module({
  imports: [
    PrismaModule,
    StripeModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [
    SubscriptionsController,
    AdminSubscriptionsController,
  ],
  providers: [
    SubscriptionsService,
    ActiveSubscriptionGuard,
    SubscriptionExpiryJob,
  ],
  exports: [SubscriptionsService, ActiveSubscriptionGuard],
})
export class SubscriptionsModule {}
