import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RatingsService {
  private readonly logger = new Logger(RatingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async updateAverageRating(ratedUserId: string) {
    const ratings = await this.prisma.rating.aggregate({
      where: { ratedUserId },
      _avg: { rating: true },
      _count: { rating: true },
    });

    const averageRating = ratings._avg.rating
      ? Math.round(ratings._avg.rating * 10) / 10
      : 0;

    const driver = await this.prisma.driver.findFirst({
      where: { userId: ratedUserId },
    });

    if (driver) {
      await this.prisma.driver.update({
        where: { id: driver.id },
        data: { averageRating },
      });
      return;
    }

    const passenger = await this.prisma.passenger.findFirst({
      where: { userId: ratedUserId },
    });

    if (passenger) {
      await this.prisma.passenger.update({
        where: { id: passenger.id },
        data: { averageRating },
      });
    }
  }

  async getUserRatings(userId: string, limit = 20, offset = 0) {
    const [ratings, total] = await Promise.all([
      this.prisma.rating.findMany({
        where: { ratedUserId: userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          User: {
            select: {
              firstName: true,
              lastName: true,
              profileImage: true,
            },
          },
          Ride: {
            select: {
              originAddress: true,
              destinationAddress: true,
              dropOffTime: true,
            },
          },
        },
      }),
      this.prisma.rating.count({
        where: { ratedUserId: userId },
      }),
    ]);

    return { ratings, total };
  }

  async getRatingSummary(userId: string) {
    const aggregate = await this.prisma.rating.aggregate({
      where: { ratedUserId: userId },
      _avg: { rating: true },
      _count: { rating: true },
    });

    const distribution = await this.prisma.rating.groupBy({
      by: ['rating'],
      where: { ratedUserId: userId },
      _count: { rating: true },
    });

    const stars: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    distribution.forEach((d) => {
      const key = Math.round(d.rating);
      if (key >= 1 && key <= 5) {
        stars[key] = d._count.rating;
      }
    });

    return {
      averageRating: aggregate._avg.rating
        ? Math.round(aggregate._avg.rating * 10) / 10
        : 0,
      totalRatings: aggregate._count.rating,
      distribution: stars,
    };
  }
}
