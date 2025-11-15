import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function debugDriverVehicle() {
  try {
    console.log('🔍 Investigando dados do motorista Carlos...\n');

    const driverId = '5fb5ce77-ff46-4046-9915-3032f5fa3421';
    const userId = '3a182939-70f1-4221-8aab-f4013a0a5567';

    // 1. Verificar User
    console.log('1️⃣ Buscando User...');
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    console.log('User:', JSON.stringify(user, null, 2));
    console.log('');

    // 2. Verificar Driver
    console.log('2️⃣ Buscando Driver...');
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
    });
    console.log('Driver:', JSON.stringify(driver, null, 2));
    console.log('');

    // 3. Verificar Vehicle
    console.log('3️⃣ Buscando Vehicle...');
    const vehicle = await prisma.vehicle.findUnique({
      where: { driverId },
    });
    console.log('Vehicle:', JSON.stringify(vehicle, null, 2));
    console.log('');

    // 4. Verificar relação User -> Driver
    console.log('4️⃣ Buscando User com Driver incluído...');
    const userWithDriver = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        Driver: true,
      },
    });
    console.log('User.Driver:', JSON.stringify(userWithDriver?.Driver, null, 2));
    console.log('');

    // 5. Verificar relação Driver -> Vehicle
    console.log('5️⃣ Buscando Driver com Vehicle incluído...');
    const driverWithVehicle = await prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        Vehicle: true,
      },
    });
    console.log('Driver.Vehicle:', JSON.stringify(driverWithVehicle?.Vehicle, null, 2));
    console.log('');

    // 6. Verificar endpoint /auth/me (simulando)
    console.log('6️⃣ Simulando chamada GET /auth/me...');
    const authMeData = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        profileImage: true,
        gender: true,
        isVerified: true,
        Driver: {
          select: {
            id: true,
            licenseNumber: true,
            isAvailable: true,
            currentLatitude: true,
            currentLongitude: true,
            averageRating: true,
            totalRides: true,
            accountStatus: true,
            isOnline: true,
            acceptsFemaleOnly: true,
            bankAccount: true,
            Vehicle: true, // ← IMPORTANTE: Vehicle deve estar aqui!
          },
        },
      },
    });
    console.log('GET /auth/me response:', JSON.stringify(authMeData, null, 2));
    console.log('');

    // 7. Verificar tipos associados
    console.log('7️⃣ Buscando tipos de corrida associados...');
    const driverRideTypes = await prisma.driverRideType.findMany({
      where: { driverId },
      include: {
        RideTypeConfig: true,
      },
    });
    console.log(`Total de tipos: ${driverRideTypes.length}`);
    driverRideTypes.forEach((drt) => {
      console.log(`  - ${drt.RideTypeConfig.name} (${drt.RideTypeConfig.type}): ${drt.isActive ? 'ATIVO' : 'INATIVO'}`);
    });
    console.log('');

    // RESUMO
    console.log('═══════════════════════════════════════');
    console.log('📊 RESUMO DO PROBLEMA');
    console.log('═══════════════════════════════════════\n');

    if (!user) {
      console.log('❌ User não existe!');
    } else {
      console.log('✅ User existe');
    }

    if (!driver) {
      console.log('❌ Driver não existe!');
    } else {
      console.log('✅ Driver existe');
    }

    if (!vehicle) {
      console.log('❌ Vehicle NÃO EXISTE! ← PROBLEMA AQUI');
      console.log('   Solução: Veículo precisa ser criado');
    } else {
      console.log('✅ Vehicle existe');
      console.log(`   ${vehicle.make} ${vehicle.model} - ${vehicle.vehicleType}`);
    }

    if (userWithDriver?.Driver) {
      console.log('✅ Relação User -> Driver OK');
    } else {
      console.log('❌ Relação User -> Driver QUEBRADA');
    }

    if (driverWithVehicle?.Vehicle) {
      console.log('✅ Relação Driver -> Vehicle OK');
    } else {
      console.log('❌ Relação Driver -> Vehicle QUEBRADA ← PROBLEMA AQUI');
      console.log('   Veículo não está vinculado ao Driver!');
    }

    if (authMeData?.Driver?.Vehicle) {
      console.log('✅ Endpoint /auth/me retorna Vehicle OK');
    } else {
      console.log('❌ Endpoint /auth/me NÃO retorna Vehicle ← PROBLEMA AQUI');
      console.log('   Frontend não recebe dados do veículo!');
    }

  } catch (error) {
    console.error('❌ Erro:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

debugDriverVehicle()
  .then(() => {
    console.log('\n✅ Debug concluído');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Falha:', error);
    process.exit(1);
  });
