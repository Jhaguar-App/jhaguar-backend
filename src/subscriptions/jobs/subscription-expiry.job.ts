import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { addDays, differenceInDays } from 'date-fns';

@Injectable()
export class SubscriptionExpiryJob {
  private readonly logger = new Logger(SubscriptionExpiryJob.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async checkExpiredSubscriptions() {
    const now = new Date();

    try {
      const expiredSubscriptions = await this.prisma.driverSubscription.findMany({
        where: {
          status: 'ACTIVE',
          endDate: { lte: now },
        },
        include: {
          driver: { select: { id: true, userId: true } },
          plan: { select: { name: true } },
        },
      });

      if (expiredSubscriptions.length === 0) {
        this.logger.debug('No expired subscriptions found');
        return;
      }

      for (const subscription of expiredSubscriptions) {
        await this.prisma.$transaction([
          this.prisma.driverSubscription.update({
            where: { id: subscription.id },
            data: { status: 'EXPIRED' },
          }),
          this.prisma.driver.update({
            where: { id: subscription.driverId },
            data: {
              currentSubscriptionId: null,
              subscriptionStatus: 'EXPIRED',
              subscriptionExpiresAt: null,
              isOnline: false,
              isAvailable: false,
            },
          }),
        ]);

        this.logger.log(
          `Expired subscription ${subscription.id} for driver ${subscription.driverId}`
        );
      }

      this.logger.log(`Processed ${expiredSubscriptions.length} expired subscriptions`);
    } catch (error) {
      this.logger.error('Error checking expired subscriptions', error.stack);
    }
  }

  @Cron('0 9 * * *')
  async sendExpiryReminders() {
    const threeDaysFromNow = addDays(new Date(), 3);
    const now = new Date();

    try {
      const expiringSubscriptions = await this.prisma.driverSubscription.findMany({
        where: {
          status: 'ACTIVE',
          endDate: {
            gte: now,
            lte: threeDaysFromNow,
          },
        },
        include: {
          driver: { select: { userId: true } },
          plan: { select: { name: true, type: true } },
        },
      });

      if (expiringSubscriptions.length === 0) {
        this.logger.debug('No expiring subscriptions found');
        return;
      }

      for (const subscription of expiringSubscriptions) {
        const daysLeft = subscription.endDate
          ? differenceInDays(subscription.endDate, new Date())
          : 0;

        this.logger.log(
          `Subscription ${subscription.id} expires in ${daysLeft} days (driver: ${subscription.driverId})`
        );
      }

      this.logger.log(`Sent ${expiringSubscriptions.length} expiry reminders`);
    } catch (error) {
      this.logger.error('Error sending expiry reminders', error.stack);
    }
  }
}
