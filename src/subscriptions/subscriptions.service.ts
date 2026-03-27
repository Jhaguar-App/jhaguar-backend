import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AsaasService } from '../asaas/asaas.service';
import { AsaasBillingType } from '../asaas/interfaces/asaas.interfaces';
import { CreatePlanDto, UpdatePlanDto, PurchasePlanDto, GrantPlanDto } from './dto';
import { SubscriptionPlanType, SubscriptionStatus } from '@prisma/client';
import { addDays } from 'date-fns';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly asaasService: AsaasService,
  ) {}

  async getAvailablePlans() {
    const plans = await this.prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { price: 'asc' },
    });

    return plans;
  }

  async getAllPlans() {
    const plans = await this.prisma.subscriptionPlan.findMany({
      orderBy: { price: 'asc' },
    });

    return plans;
  }

  async getPlanById(planId: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('Plano não encontrado');
    }

    return plan;
  }

  async purchasePlan(driverId: string, dto: PurchasePlanDto) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        currentSubscription: true,
        User: true,
      },
    });

    if (!driver) {
      throw new NotFoundException('Motorista não encontrado');
    }

    const plan = await this.getPlanById(dto.planId);

    if (!plan.isActive) {
      throw new BadRequestException('Este plano não está mais disponível');
    }

    if (driver.currentSubscription && driver.currentSubscription.status === 'ACTIVE') {
      const now = new Date();
      if (driver.currentSubscription.endDate && driver.currentSubscription.endDate > now) {
        throw new BadRequestException(
          'Você já possui um plano ativo. Aguarde a expiração para comprar um novo.'
        );
      }
    }

    const chargeResult = await this.asaasService.createCharge({
      name: `${driver.User.firstName} ${driver.User.lastName}`,
      email: driver.User.email,
      phone: driver.User.phone,
      value: plan.price,
      billingType: dto.billingType || AsaasBillingType.PIX,
      description: `Assinatura ${plan.name}`,
      externalReference: `driver_${driverId}_plan_${plan.id}`,
    });

    const subscription = await this.prisma.driverSubscription.create({
      data: {
        driverId: driver.id,
        planId: plan.id,
        status: 'PENDING_PAYMENT',
        amount: plan.price,
        paymentIntentId: chargeResult.charge.id,
      },
      include: {
        plan: true,
      },
    });

    this.logger.log(`ASAAS charge created for driver ${driverId}, subscription ${subscription.id}`);

    return {
      subscriptionId: subscription.id,
      chargeId: chargeResult.charge.id,
      amount: plan.price,
      planName: plan.name,
      billingType: chargeResult.charge.billingType,
      status: chargeResult.charge.status,
      invoiceUrl: chargeResult.charge.invoiceUrl,
      bankSlipUrl: chargeResult.charge.bankSlipUrl,
      pixQrCode: chargeResult.pixQrCode,
    };
  }

  async confirmPlanPayment(paymentIntentId: string) {
    const subscription = await this.prisma.driverSubscription.findFirst({
      where: { paymentIntentId },
      include: { plan: true, driver: true },
    });

    if (!subscription) {
      throw new NotFoundException('Assinatura não encontrada');
    }

    if (subscription.status === 'ACTIVE') {
      this.logger.warn(`Subscription ${subscription.id} already active`);
      return subscription;
    }

    const now = new Date();
    const endDate = addDays(now, subscription.plan.durationDays);

    const [updatedSubscription] = await this.prisma.$transaction([
      this.prisma.driverSubscription.update({
        where: { id: subscription.id },
        data: {
          status: 'ACTIVE',
          startDate: now,
          endDate,
        },
        include: { plan: true },
      }),
      this.prisma.driver.update({
        where: { id: subscription.driverId },
        data: {
          currentSubscriptionId: subscription.id,
          subscriptionStatus: 'ACTIVE',
          subscriptionExpiresAt: endDate,
        },
      }),
    ]);

    this.logger.log(`Subscription ${subscription.id} activated for driver ${subscription.driverId}`);

    return updatedSubscription;
  }

  async checkSubscriptionStatus(driverId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        currentSubscription: {
          include: { plan: true },
        },
      },
    });

    if (!driver) {
      throw new NotFoundException('Motorista não encontrado');
    }

    if (!driver.currentSubscription || driver.currentSubscription.status !== 'ACTIVE') {
      return {
        hasActiveSubscription: false,
        subscription: null,
      };
    }

    const now = new Date();
    if (!driver.currentSubscription.endDate || driver.currentSubscription.endDate < now) {
      await this.expireSubscription(driver.currentSubscription.id);
      return {
        hasActiveSubscription: false,
        subscription: null,
      };
    }

    return {
      hasActiveSubscription: true,
      subscription: driver.currentSubscription,
    };
  }

  async getActiveSubscription(driverId: string) {
    const result = await this.checkSubscriptionStatus(driverId);
    return result.hasActiveSubscription ? result.subscription : null;
  }

  async getSubscriptionHistory(driverId: string) {
    const subscriptions = await this.prisma.driverSubscription.findMany({
      where: { driverId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    return subscriptions;
  }

  async expireSubscription(subscriptionId: string) {
    const subscription = await this.prisma.driverSubscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new NotFoundException('Assinatura não encontrada');
    }

    await this.prisma.$transaction([
      this.prisma.driverSubscription.update({
        where: { id: subscriptionId },
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

    this.logger.log(`Subscription ${subscriptionId} expired for driver ${subscription.driverId}`);
  }

  async createPlan(dto: CreatePlanDto) {
    const existingPlan = await this.prisma.subscriptionPlan.findFirst({
      where: { type: dto.type },
    });

    if (existingPlan) {
      throw new BadRequestException(`Já existe um plano do tipo ${dto.type}`);
    }

    const plan = await this.prisma.subscriptionPlan.create({
      data: dto,
    });

    this.logger.log(`Plan created: ${plan.id} - ${plan.name}`);

    return plan;
  }

  async updatePlan(planId: string, dto: UpdatePlanDto) {
    const plan = await this.getPlanById(planId);

    const updatedPlan = await this.prisma.subscriptionPlan.update({
      where: { id: planId },
      data: dto,
    });

    this.logger.log(`Plan updated: ${planId}`);

    return updatedPlan;
  }

  async deletePlan(planId: string) {
    const plan = await this.getPlanById(planId);

    const activeSubscriptions = await this.prisma.driverSubscription.count({
      where: {
        planId,
        status: 'ACTIVE',
      },
    });

    if (activeSubscriptions > 0) {
      throw new BadRequestException(
        `Não é possível deletar este plano pois ${activeSubscriptions} motoristas ainda possuem assinaturas ativas`
      );
    }

    await this.prisma.subscriptionPlan.update({
      where: { id: planId },
      data: { isActive: false },
    });

    this.logger.log(`Plan deactivated: ${planId}`);

    return { message: 'Plano desativado com sucesso' };
  }

  async grantPlan(driverId: string, dto: GrantPlanDto) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: { currentSubscription: true },
    });

    if (!driver) {
      throw new NotFoundException('Motorista não encontrado');
    }

    const plan = await this.getPlanById(dto.planId);

    if (driver.currentSubscription && driver.currentSubscription.status === 'ACTIVE') {
      const now = new Date();
      if (driver.currentSubscription.endDate && driver.currentSubscription.endDate > now) {
        throw new BadRequestException('Motorista já possui um plano ativo');
      }
    }

    const now = new Date();
    const durationDays = dto.durationDays || plan.durationDays;
    const endDate = addDays(now, durationDays);

    const subscription = await this.prisma.driverSubscription.create({
      data: {
        driverId: driver.id,
        planId: plan.id,
        status: 'ACTIVE',
        startDate: now,
        endDate,
        amount: 0,
        paymentIntentId: `admin_grant_${Date.now()}`,
      },
      include: { plan: true },
    });

    await this.prisma.driver.update({
      where: { id: driverId },
      data: {
        currentSubscriptionId: subscription.id,
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: endDate,
      },
    });

    this.logger.log(`Plan granted to driver ${driverId} by admin. Reason: ${dto.reason || 'N/A'}`);

    return subscription;
  }

  async getStatistics() {
    const [
      totalActive,
      totalExpired,
      totalPending,
      totalCancelled,
      subscriptionsByPlan,
    ] = await Promise.all([
      this.prisma.driverSubscription.count({
        where: { status: 'ACTIVE' },
      }),
      this.prisma.driverSubscription.count({
        where: { status: 'EXPIRED' },
      }),
      this.prisma.driverSubscription.count({
        where: { status: 'PENDING_PAYMENT' },
      }),
      this.prisma.driverSubscription.count({
        where: { status: 'CANCELLED' },
      }),
      this.prisma.driverSubscription.groupBy({
        by: ['planId'],
        where: { status: 'ACTIVE' },
        _count: true,
      }),
    ]);

    const revenue = await this.prisma.driverSubscription.aggregate({
      where: {
        status: 'ACTIVE',
        createdAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
      _sum: { amount: true },
    });

    const plans = await this.prisma.subscriptionPlan.findMany();
    const planDistribution = subscriptionsByPlan.map(item => {
      const plan = plans.find(p => p.id === item.planId);
      return {
        planId: item.planId,
        planName: plan?.name || 'Unknown',
        planType: plan?.type || 'Unknown',
        count: item._count,
      };
    });

    return {
      totalActiveSubscriptions: totalActive,
      totalExpired,
      totalPending,
      totalCancelled,
      revenueThisMonth: revenue._sum.amount || 0,
      planDistribution,
    };
  }

  async getExpiringSoon(days: number = 7) {
    const futureDate = addDays(new Date(), days);

    const expiring = await this.prisma.driverSubscription.findMany({
      where: {
        status: 'ACTIVE',
        endDate: {
          gte: new Date(),
          lte: futureDate,
        },
      },
      include: {
        driver: {
          include: {
            User: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        },
        plan: true,
      },
      orderBy: { endDate: 'asc' },
    });

    return expiring;
  }
}
