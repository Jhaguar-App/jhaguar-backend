import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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
    // Fetch driver with vehicle to validate requirements
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: { Vehicle: true, User: true },
    });

    if (!driver) {
      throw new NotFoundException('Motorista não encontrado');
    }

    // First, get all available ride types
    const allTypes = await this.prisma.rideTypeConfig.findMany();
    
    // Validate requirements
    for (const cat of categories) {
      const typeConfig = allTypes.find((t) => t.type === cat);
      if (!typeConfig) continue;

      if (typeConfig.requiresArmored && !driver.Vehicle?.isArmored) {
        throw new BadRequestException(`A categoria ${typeConfig.name} requer veículo blindado.`);
      }
      if (typeConfig.requiresPetFriendly && !driver.Vehicle?.isPetFriendly) {
        throw new BadRequestException(`A categoria ${typeConfig.name} requer veículo Pet Friendly.`);
      }
      if (typeConfig.type === 'EXECUTIVO' && !driver.Vehicle?.isLuxury) {
         throw new BadRequestException(`A categoria ${typeConfig.name} requer veículo de luxo.`);
      }
      if (typeConfig.type === 'DELIVERY' && !driver.Vehicle?.deliveryCapable) {
         throw new BadRequestException(`A categoria ${typeConfig.name} requer habilitação para entregas.`);
      }
      if (typeConfig.type === 'MOTO' && !driver.Vehicle?.isMotorcycle) {
         throw new BadRequestException(`A categoria ${typeConfig.name} requer motocicleta.`);
      }
      if (typeConfig.type === 'MULHER' && driver.User.gender !== 'FEMALE') {
         throw new BadRequestException(`A categoria ${typeConfig.name} é exclusiva para motoristas mulheres.`);
      }
       // Prevent assigning MOTO category to cars and vice-versa (basic check)
      if (typeConfig.type !== 'MOTO' && driver.Vehicle?.isMotorcycle && typeConfig.type !== 'DELIVERY') {
          // Assuming motorcycles can only do MOTO and DELIVERY
           throw new BadRequestException(`Motocicletas só podem realizar corridas Moto ou Delivery.`);
      }
    }

    // Transaction to update categories
    return this.prisma.$transaction(async (tx) => {
      // Get existing categories for this driver
      const existingTypes = await tx.driverRideType.findMany({
        where: { driverId },
        include: { RideTypeConfig: true },
      });

      const existingTypeNames = existingTypes.map((et) => et.RideTypeConfig.type);

      // 1. Delete categories that are no longer selected
      const typesToDelete = existingTypes.filter(
        (et) => !categories.includes(et.RideTypeConfig.type),
      );
      
      if (typesToDelete.length > 0) {
        await tx.driverRideType.deleteMany({
          where: {
            id: { in: typesToDelete.map((t) => t.id) },
          },
        });
      }

      // 2. Add new categories that are selected but don't exist yet
      for (const cat of categories) {
        if (!existingTypeNames.includes(cat)) {
          const typeConfig = allTypes.find((t) => t.type === cat);
          if (typeConfig) {
            await tx.driverRideType.create({
              data: {
                driverId,
                rideTypeId: typeConfig.id,
                isActive: true, // Default to true for new permissions
              },
            });
          }
        }
      }

      // 3. Existing categories are left untouched to preserve driver's "isActive" preference

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
        isArmored: vehicleData.isArmored || false,
        isLuxury: vehicleData.isLuxury || false,
        isPetFriendly: vehicleData.isPetFriendly || false,
        deliveryCapable: vehicleData.deliveryCapable || false,
        isMotorcycle: vehicleData.isMotorcycle || false,
      },
      update: {
        make: vehicleData.make,
        model: vehicleData.model,
        year: Number(vehicleData.year),
        color: vehicleData.color,
        licensePlate: vehicleData.licensePlate,
        isArmored: vehicleData.isArmored,
        isLuxury: vehicleData.isLuxury,
        isPetFriendly: vehicleData.isPetFriendly,
        deliveryCapable: vehicleData.deliveryCapable,
        isMotorcycle: vehicleData.isMotorcycle,
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
