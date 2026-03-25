import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentMethod } from '@prisma/client';
import { startOfDay, startOfWeek, startOfMonth } from 'date-fns';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recordRidePayment(rideId: string, paymentMethod: PaymentMethod) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      select: {
        id: true,
        finalPrice: true,
        status: true,
        Payment: true,
      },
    });

    if (!ride) {
      throw new NotFoundException('Corrida não encontrada');
    }

    if (ride.status !== 'COMPLETED') {
      throw new BadRequestException('Corrida ainda não foi completada');
    }

    if (ride.Payment) {
      this.logger.warn(`Payment already recorded for ride ${rideId}`);
      return ride.Payment;
    }

    const payment = await this.prisma.payment.create({
      data: {
        rideId,
        amount: ride.finalPrice || 0,
        method: paymentMethod,
        status: 'COMPLETED',
      },
    });

    await this.prisma.ride.update({
      where: { id: rideId },
      data: { paymentStatus: 'PAID' },
    });

    this.logger.log(`Payment recorded for ride ${rideId}: ${paymentMethod}`);

    return payment;
  }

  async getPaymentHistory(userId: string, filters?: {
    startDate?: Date;
    endDate?: Date;
    method?: PaymentMethod;
  }) {
    const where: any = {
      Ride: {
        OR: [
          { passengerId: userId },
          { driver: { userId } },
        ],
      },
    };

    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    if (filters?.method) {
      where.method = filters.method;
    }

    const payments = await this.prisma.payment.findMany({
      where,
      include: {
        Ride: {
          select: {
            originAddress: true,
            destinationAddress: true,
            status: true,
            createdAt: true,
            passengerId: true,
            driverId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return payments;
  }

  async getPaymentStatistics(driverId: string, period: 'day' | 'week' | 'month') {
    const startDate = this.getStartDate(period);

    const payments = await this.prisma.payment.findMany({
      where: {
        Ride: { driverId },
        createdAt: { gte: startDate },
        status: 'COMPLETED',
      },
    });

    const totalEarnings = payments.reduce((sum, p) => sum + p.amount, 0);
    const totalRides = payments.length;
    const averagePerRide = totalRides > 0 ? totalEarnings / totalRides : 0;

    const byMethod = payments.reduce((acc, payment) => {
      const method = payment.method;
      acc[method] = (acc[method] || 0) + payment.amount;
      return acc;
    }, {} as Record<PaymentMethod, number>);

    return {
      period,
      startDate,
      endDate: new Date(),
      totalRides,
      totalEarnings,
      averagePerRide,
      byMethod,
    };
  }

  async getGlobalStatistics(filters?: {
    startDate?: Date;
    endDate?: Date;
  }) {
    const where: any = {
      status: 'COMPLETED',
    };

    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    const [totalPayments, aggregation, byMethod] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.aggregate({
        where,
        _sum: { amount: true },
        _avg: { amount: true },
      }),
      this.prisma.payment.groupBy({
        by: ['method'],
        where,
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    return {
      totalPayments,
      totalAmount: aggregation._sum.amount || 0,
      averageAmount: aggregation._avg.amount || 0,
      byMethod: byMethod.map(item => ({
        method: item.method,
        count: item._count,
        total: item._sum.amount || 0,
      })),
    };
  }

  async generateReport(filters: {
    startDate: Date;
    endDate: Date;
    driverId?: string;
  }) {
    const where: any = {
      status: 'COMPLETED',
      createdAt: {
        gte: filters.startDate,
        lte: filters.endDate,
      },
    };

    if (filters.driverId) {
      where.Ride = { driverId: filters.driverId };
    }

    const payments = await this.prisma.payment.findMany({
      where,
      include: {
        Ride: {
          select: {
            id: true,
            originAddress: true,
            destinationAddress: true,
            createdAt: true,
            Driver: {
              select: {
                id: true,
                User: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
            Passenger: {
              select: {
                id: true,
                User: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const summary = {
      totalPayments: payments.length,
      totalAmount: payments.reduce((sum, p) => sum + p.amount, 0),
      byMethod: this.groupByMethod(payments),
    };

    return {
      summary,
      payments,
    };
  }

  private getStartDate(period: 'day' | 'week' | 'month'): Date {
    const now = new Date();
    switch (period) {
      case 'day':
        return startOfDay(now);
      case 'week':
        return startOfWeek(now);
      case 'month':
        return startOfMonth(now);
    }
  }

  private groupByMethod(payments: any[]) {
    return payments.reduce((acc, payment) => {
      const method = payment.method;
      if (!acc[method]) {
        acc[method] = { count: 0, total: 0 };
      }
      acc[method].count++;
      acc[method].total += payment.amount;
      return acc;
    }, {} as Record<PaymentMethod, { count: number; total: number }>);
  }

  async getOrCreateWallet(userId: string) {
    let wallet = await this.prisma.userWallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      wallet = await this.prisma.userWallet.create({
        data: {
          userId,
          balance: 0,
        },
      });
      this.logger.log(`Carteira criada para usuário ${userId}`);
    }

    return wallet;
  }

  async getWalletBalance(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);
    return wallet.balance;
  }

  async getPaymentMethods(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);

    return {
      wallet: {
        available: true,
        balance: wallet.balance,
      },
      creditCard: {
        available: true,
      },
      debitCard: {
        available: true,
      },
      pix: {
        available: true,
      },
      cash: {
        available: true,
      },
    };
  }

  async processRidePaymentByMethod(data: {
    rideId: string;
    userId: string;
    amount: number;
    method: PaymentMethod;
  }) {
    const { rideId, userId, amount, method } = data;

    try {
      const payment = await this.prisma.payment.create({
        data: {
          rideId,
          amount,
          method,
          status: 'COMPLETED',
        },
      });

      await this.prisma.ride.update({
        where: { id: rideId },
        data: { paymentStatus: 'PAID' },
      });

      this.logger.log(`Pagamento processado: ${rideId} - ${method} - R$ ${amount}`);

      return {
        success: true,
        payment,
      };
    } catch (error) {
      this.logger.error(`Erro ao processar pagamento: ${error.message}`);
      return {
        success: false,
        message: error.message || 'Erro ao processar pagamento',
      };
    }
  }
}
