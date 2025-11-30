import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Status, RideTypeEnum } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async getStats() {
    const totalUsers = await this.prisma.user.count();
    const totalDrivers = await this.prisma.driver.count();
    const pendingDrivers = await this.prisma.driver.count({
      where: { accountStatus: Status.PENDING },
    });
    const onlineDrivers = await this.prisma.driver.count({
      where: { isOnline: true },
    });
    const totalRides = await this.prisma.ride.count();
    const activeRides = await this.prisma.ride.count({
      where: { status: 'IN_PROGRESS' },
    });

    return {
      totalUsers,
      totalDrivers,
      pendingDrivers,
      onlineDrivers,
      totalRides,
      activeRides,
    };
  }

  async getDrivers(page: number = 1, limit: number = 10, status?: Status, search?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (status) {
      where.accountStatus = status;
    }

    if (search) {
      where.User = {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const [drivers, total] = await this.prisma.$transaction([
      this.prisma.driver.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          User: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              profileImage: true,
            },
          },
          Vehicle: true,
        },
        orderBy: {
          id: 'desc',
        },
      }),
      this.prisma.driver.count({ where }),
    ]);

    return {
      data: drivers,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getDriver(id: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id },
      include: {
        User: true,
        Vehicle: true,
        DriverDocument: true,
        DriverRideType: {
          include: {
            RideTypeConfig: true,
          },
        },
      },
    });

    if (!driver) {
      throw new NotFoundException('Motorista não encontrado');
    }

    return driver;
  }

  async updateDriverStatus(id: string, status: Status) {
    return this.prisma.driver.update({
      where: { id },
      data: { accountStatus: status },
    });
  }

  async updateVehicleStatus(driverId: string, status: Status) {
    return this.prisma.vehicle.update({
      where: { driverId },
      data: { inspectionStatus: status },
    });
  }

  async updateDriverCategories(driverId: string, categories: RideTypeEnum[]) {
    // First, get all available ride types
    const allTypes = await this.prisma.rideTypeConfig.findMany();
    
    // Transaction to update categories
    return this.prisma.$transaction(async (tx) => {
      // Disable all existing categories for this driver
      await tx.driverRideType.updateMany({
        where: { driverId },
        data: { isActive: false },
      });

      // Enable or create the selected ones
      for (const cat of categories) {
        const typeConfig = allTypes.find((t) => t.type === cat);
        if (typeConfig) {
          await tx.driverRideType.upsert({
            where: {
              driverId_rideTypeId: {
                driverId,
                rideTypeId: typeConfig.id,
              },
            },
            create: {
              driverId,
              rideTypeId: typeConfig.id,
              isActive: true,
            },
            update: {
              isActive: true,
            },
          });
        }
      }

      return this.getDriver(driverId);
    });
  }

  async updateDriverVehicle(driverId: string, vehicleData: any) {
    return this.prisma.vehicle.upsert({
      where: { driverId },
      create: {
        driverId,
        make: vehicleData.make,
        model: vehicleData.model,
        year: Number(vehicleData.year),
        color: vehicleData.color,
        licensePlate: vehicleData.licensePlate,
        vehicleType: 'ECONOMY', // Default
        capacity: 4, // Default
        registrationExpiryDate: new Date(
          new Date().setFullYear(new Date().getFullYear() + 1),
        ),
        insuranceExpiryDate: new Date(
          new Date().setFullYear(new Date().getFullYear() + 1),
        ),
        inspectionStatus: Status.PENDING,
      },
      update: {
        make: vehicleData.make,
        model: vehicleData.model,
        year: Number(vehicleData.year),
        color: vehicleData.color,
        licensePlate: vehicleData.licensePlate,
      },
    });
  }

  async getUsers(page: number = 1, limit: number = 10, search?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
            Passenger: true,
            Driver: true,
        }
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
