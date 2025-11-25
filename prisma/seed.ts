import {
  PrismaClient,
  RideTypeEnum,
  VehicleType,
  Gender,
  Status,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed process...\n');

  // Limpar dados existentes
  console.log('🧹 Cleaning existing data...');
  await prisma.chatMessage.deleteMany({});
  await prisma.rating.deleteMany({});
  await prisma.rideLocation.deleteMany({});
  await prisma.rideStatusHistory.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.rideChat.deleteMany({});
  await prisma.ride.deleteMany({});
  await prisma.rideRequest.deleteMany({});
  await prisma.driverRideType.deleteMany({});
  await prisma.driverLocation.deleteMany({});
  await prisma.driverDocument.deleteMany({});
  await prisma.vehicle.deleteMany({});
  await prisma.driver.deleteMany({});
  await prisma.passenger.deleteMany({});
  await prisma.userWallet.deleteMany({});
  await prisma.rideTypeConfig.deleteMany({});
  await prisma.user.deleteMany({});
  console.log('✅ Data cleaned\n');

  // 1. Criar Ride Types
  console.log('🚗 Creating ride types...');
  const rideTypes = [
    {
      type: RideTypeEnum.NORMAL,
      name: 'Normal',
      description: 'Opção econômica e confiável para o dia a dia.',
      icon: 'car-sport',
      vehicleTypes: [VehicleType.ECONOMY, VehicleType.COMFORT],
      basePrice: 5.0,
      pricePerKm: 1.8,
      pricePerMin: 0.3,
      minimumPrice: 8.0,
      priority: 1,
    },
    {
      type: RideTypeEnum.EXECUTIVO,
      name: 'Executivo',
      description: 'Maior conforto com veículos premium.',
      icon: 'car',
      vehicleTypes: [VehicleType.LUXURY, VehicleType.SUV],
      basePrice: 8.0,
      pricePerKm: 2.5,
      pricePerMin: 0.45,
      minimumPrice: 12.0,
      priority: 2,
    },
    {
      type: RideTypeEnum.PET,
      name: 'Pet',
      description: 'Transporte seguro para você e seu pet.',
      icon: 'paw',
      requiresPetFriendly: true,
      vehicleTypes: [VehicleType.ECONOMY, VehicleType.COMFORT, VehicleType.SUV],
      basePrice: 7.0,
      pricePerKm: 2.0,
      pricePerMin: 0.35,
      minimumPrice: 10.0,
      priority: 3,
    },
    {
      type: RideTypeEnum.MULHER,
      name: 'Mulher',
      description: 'Exclusivo para mulheres com motoristas mulheres.',
      icon: 'woman',
      femaleOnly: true,
      vehicleTypes: [VehicleType.ECONOMY, VehicleType.COMFORT],
      basePrice: 5.5,
      pricePerKm: 1.8,
      pricePerMin: 0.3,
      minimumPrice: 8.5,
      priority: 3,
    },
  ];

  for (const rideType of rideTypes) {
    await prisma.rideTypeConfig.create({ data: rideType });
  }
  console.log(`✅ Created ${rideTypes.length} ride types\n`);

  // 2. Criar Motoristas Aprovados
  console.log('👨‍✈️ Creating approved drivers...');
  const hashedPassword = await bcrypt.hash('Driver123!', 10);

  // Motorista 1 - João Silva (Masculino)
  const driver1User = await prisma.user.create({
    data: {
      email: 'motorista.aprovado@test.com',
      phone: '+5517991111111',
      firstName: 'João',
      lastName: 'Silva',
      password: hashedPassword,
      gender: Gender.MALE,
      isVerified: true,
      dateOfBirth: new Date('1985-03-15'),
    },
  });

  await prisma.userWallet.create({
    data: {
      userId: driver1User.id,
      balance: 100.0,
      currency: 'BRL',
    },
  });

  const driver1 = await prisma.driver.create({
    data: {
      userId: driver1User.id,
      licenseNumber: 'CNH12345678',
      licenseExpiryDate: new Date('2026-12-31'),
      accountStatus: Status.APPROVED,
      backgroundCheckStatus: Status.APPROVED,
      backgroundCheckDate: new Date(),
      isAvailable: true,
      isOnline: false,
      currentLatitude: -20.3155,
      currentLongitude: -50.7416,
    },
  });

  await prisma.vehicle.create({
    data: {
      driverId: driver1.id,
      make: 'Toyota',
      model: 'Corolla',
      year: 2022,
      color: 'Prata',
      licensePlate: 'ABC1234',
      registrationExpiryDate: new Date('2026-12-31'),
      insuranceExpiryDate: new Date('2025-12-31'),
      vehicleType: VehicleType.COMFORT,
      capacity: 4,
      features: ['Ar Condicionado', 'Vidros Elétricos', 'Bluetooth'],
      inspectionStatus: Status.APPROVED,
      inspectionDate: new Date(),
      isPetFriendly: true,
    },
  });

  // Associar motorista 1 aos tipos de corrida
  const normalRideType = await prisma.rideTypeConfig.findUnique({
    where: { type: RideTypeEnum.NORMAL },
  });
  const petRideType = await prisma.rideTypeConfig.findUnique({
    where: { type: RideTypeEnum.PET },
  });

  if (normalRideType) {
    await prisma.driverRideType.create({
      data: {
        driverId: driver1.id,
        rideTypeId: normalRideType.id,
        isActive: true,
      },
    });
  }

  if (petRideType) {
    await prisma.driverRideType.create({
      data: {
        driverId: driver1.id,
        rideTypeId: petRideType.id,
        isActive: true,
      },
    });
  }

  console.log(
    `✅ Created driver: ${driver1User.firstName} ${driver1User.lastName}`,
  );

  // Motorista 2 - Maria Santos (Feminina)
  const driver2User = await prisma.user.create({
    data: {
      email: 'maria.santos@jhaguar.com',
      phone: '+5517992222222',
      firstName: 'Maria',
      lastName: 'Santos',
      password: hashedPassword,
      gender: Gender.FEMALE,
      isVerified: true,
      dateOfBirth: new Date('1990-07-20'),
    },
  });

  await prisma.userWallet.create({
    data: {
      userId: driver2User.id,
      balance: 150.0,
      currency: 'BRL',
    },
  });

  const driver2 = await prisma.driver.create({
    data: {
      userId: driver2User.id,
      licenseNumber: 'CNH87654321',
      licenseExpiryDate: new Date('2027-06-30'),
      accountStatus: Status.APPROVED,
      backgroundCheckStatus: Status.APPROVED,
      backgroundCheckDate: new Date(),
      isAvailable: true,
      isOnline: false,
      currentLatitude: -20.32,
      currentLongitude: -50.75,
      acceptsFemaleOnly: true,
    },
  });

  await prisma.vehicle.create({
    data: {
      driverId: driver2.id,
      make: 'Honda',
      model: 'Civic',
      year: 2023,
      color: 'Branco',
      licensePlate: 'XYZ5678',
      registrationExpiryDate: new Date('2027-06-30'),
      insuranceExpiryDate: new Date('2026-06-30'),
      vehicleType: VehicleType.COMFORT,
      capacity: 4,
      features: ['Ar Condicionado', 'Câmera de Ré', 'Sensor de Estacionamento'],
      inspectionStatus: Status.APPROVED,
      inspectionDate: new Date(),
    },
  });

  // Associar motorista 2 aos tipos de corrida
  const mulherRideType = await prisma.rideTypeConfig.findUnique({
    where: { type: RideTypeEnum.MULHER },
  });

  if (normalRideType) {
    await prisma.driverRideType.create({
      data: {
        driverId: driver2.id,
        rideTypeId: normalRideType.id,
        isActive: true,
      },
    });
  }

  if (mulherRideType) {
    await prisma.driverRideType.create({
      data: {
        driverId: driver2.id,
        rideTypeId: mulherRideType.id,
        isActive: true,
      },
    });
  }

  console.log(
    `✅ Created driver: ${driver2User.firstName} ${driver2User.lastName}\n`,
  );

  // Motorista 3 - Google Play Review
  const googlePlayPassword = await bcrypt.hash('Admin2020.', 10);
  const driver3User = await prisma.user.create({
    data: {
      email: 'lucas@motorista.com',
      phone: '+5517999999999',
      firstName: 'Lucas',
      lastName: 'Motorista',
      password: googlePlayPassword,
      gender: Gender.MALE,
      isVerified: true,
      dateOfBirth: new Date('1990-01-01'),
    },
  });

  await prisma.userWallet.create({
    data: {
      userId: driver3User.id,
      balance: 100.0,
      currency: 'BRL',
    },
  });

  const driver3 = await prisma.driver.create({
    data: {
      userId: driver3User.id,
      licenseNumber: 'CNH_TEST_PLAY',
      licenseExpiryDate: new Date('2030-12-31'),
      accountStatus: Status.APPROVED,
      backgroundCheckStatus: Status.APPROVED,
      backgroundCheckDate: new Date(),
      isAvailable: true,
      isOnline: false,
      currentLatitude: -20.3155,
      currentLongitude: -50.7416,
    },
  });

  await prisma.vehicle.create({
    data: {
      driverId: driver3.id,
      make: 'Chevrolet',
      model: 'Onix',
      year: 2024,
      color: 'Preto',
      licensePlate: 'PLAY2024',
      registrationExpiryDate: new Date('2030-12-31'),
      insuranceExpiryDate: new Date('2030-12-31'),
      vehicleType: VehicleType.COMFORT,
      capacity: 4,
      features: ['Ar Condicionado', 'Vidros Elétricos'],
      inspectionStatus: Status.APPROVED,
      inspectionDate: new Date(),
    },
  });

  if (normalRideType) {
    await prisma.driverRideType.create({
      data: {
        driverId: driver3.id,
        rideTypeId: normalRideType.id,
        isActive: true,
      },
    });
  }

  console.log(
    `✅ Created driver: ${driver3User.firstName} ${driver3User.lastName} (Google Play Review)\n`,
  );

  // 3. Criar Passageiros
  console.log('👥 Creating passengers...');
  const passengerPassword = await bcrypt.hash('Pass123!', 10);

  // Passageiro 1 - Carlos Oliveira
  const passenger1User = await prisma.user.create({
    data: {
      email: 'passageiro1a@test.com',
      phone: '+5517993333333',
      firstName: 'Carlos',
      lastName: 'Oliveira',
      password: passengerPassword,
      gender: Gender.MALE,
      isVerified: true,
      dateOfBirth: new Date('1992-11-10'),
    },
  });

  await prisma.userWallet.create({
    data: {
      userId: passenger1User.id,
      balance: 50.0,
      currency: 'BRL',
    },
  });

  await prisma.passenger.create({
    data: {
      userId: passenger1User.id,
      homeAddress: 'Rua das Flores, 123, Centro',
      homeLatitude: -20.3155,
      homeLongitude: -50.7416,
    },
  });

  console.log(
    `✅ Created passenger: ${passenger1User.firstName} ${passenger1User.lastName}`,
  );

  // Passageiro 2 - Ana Costa
  const passenger2User = await prisma.user.create({
    data: {
      email: 'ana.costa@email.com',
      phone: '+5517994444444',
      firstName: 'Ana',
      lastName: 'Costa',
      password: passengerPassword,
      gender: Gender.FEMALE,
      isVerified: true,
      dateOfBirth: new Date('1988-05-25'),
    },
  });

  await prisma.userWallet.create({
    data: {
      userId: passenger2User.id,
      balance: 75.0,
      currency: 'BRL',
    },
  });

  await prisma.passenger.create({
    data: {
      userId: passenger2User.id,
      prefersFemaleDriver: true,
      homeAddress: 'Av. Principal, 456, Bairro Novo',
      homeLatitude: -20.32,
      homeLongitude: -50.75,
    },
  });

  console.log(
    `✅ Created passenger: ${passenger2User.firstName} ${passenger2User.lastName}\n`,
  );

  console.log('🎉 Seed completed successfully!\n');
  console.log('📝 Summary:');
  console.log(`   - ${rideTypes.length} ride types`);
  console.log('   - 2 approved drivers with vehicles');
  console.log('   - 2 passengers with wallets');
  console.log('\n🔑 Login credentials:');
  console.log('   Drivers:');
  console.log('   - joao.silva@jhaguar.com / Driver123!');
  console.log('   - maria.santos@jhaguar.com / Driver123!');
  console.log('   Passengers:');
  console.log('   - carlos.oliveira@email.com / Pass123!');
  console.log('   - ana.costa@email.com / Pass123!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
