import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { REQUIRES_ACTIVE_SUBSCRIPTION_KEY } from '../decorators/requires-subscription.decorator';

@Injectable()
export class ActiveSubscriptionGuard implements CanActivate {
  private readonly logger = new Logger(ActiveSubscriptionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiresSubscription = this.reflector.getAllAndOverride<boolean>(
      REQUIRES_ACTIVE_SUBSCRIPTION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiresSubscription) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.id) {
      return true;
    }

    const driver = await this.prisma.driver.findUnique({
      where: { userId: user.id },
      include: {
        currentSubscription: {
          include: { plan: true },
        },
      },
    });

    if (!driver) {
      return true;
    }

    const subscription = driver.currentSubscription;

    if (!subscription || subscription.status !== 'ACTIVE') {
      this.logger.warn(`Driver ${driver.id} attempted to access without active subscription`);
      throw new ForbiddenException({
        message: 'Você precisa de um plano ativo para acessar esta funcionalidade',
        code: 'SUBSCRIPTION_REQUIRED',
        requiresAction: 'PURCHASE_PLAN',
      });
    }

    const now = new Date();
    if (subscription.endDate < now) {
      await this.prisma.$transaction([
        this.prisma.driverSubscription.update({
          where: { id: subscription.id },
          data: { status: 'EXPIRED' },
        }),
        this.prisma.driver.update({
          where: { id: driver.id },
          data: {
            currentSubscriptionId: null,
            subscriptionStatus: 'EXPIRED',
            subscriptionExpiresAt: null,
            isOnline: false,
            isAvailable: false,
          },
        }),
      ]);

      this.logger.warn(`Driver ${driver.id} subscription expired during access attempt`);

      throw new ForbiddenException({
        message: 'Seu plano expirou. Renove para continuar',
        code: 'SUBSCRIPTION_EXPIRED',
        requiresAction: 'RENEW_PLAN',
        details: {
          expiredAt: subscription.endDate,
          planName: subscription.plan?.name,
        },
      });
    }

    return true;
  }
}
