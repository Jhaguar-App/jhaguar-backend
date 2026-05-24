const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const passwordHash = '$2b$10$HvjpUeRggEAyi9eWUqBfl.2IRuMOW02wPD5UhfFx4VXqaqHkT2fGy';

  const driverEmail = 'reporterterramar1@gmail.com';
  const passengerEmail = 'estudionoticias1@gmsil.com';

  console.log('🔍 Verificando usuários existentes...');

  const existingDriver = await prisma.user.findUnique({
    where: { email: driverEmail },
    include: { Driver: true }
  });

  const existingPassenger = await prisma.user.findUnique({
    where: { email: passengerEmail },
    include: { Passenger: true }
  });

  if (existingDriver) {
    console.log(`❌ Removendo motorista: ${driverEmail}`);
    if (existingDriver.Driver && existingDriver.Driver.length > 0) {
      for (const driver of existingDriver.Driver) {
        await prisma.driver.delete({ where: { id: driver.id } });
      }
    }
    await prisma.user.delete({ where: { id: existingDriver.id } });
  }

  if (existingPassenger) {
    console.log(`❌ Removendo passageiro: ${passengerEmail}`);
    if (existingPassenger.Passenger && existingPassenger.Passenger.length > 0) {
      for (const passenger of existingPassenger.Passenger) {
        await prisma.passenger.delete({ where: { id: passenger.id } });
      }
    }
    await prisma.user.delete({ where: { id: existingPassenger.id } });
  }

  console.log('\n✅ Criando novos usuários...\n');

  const driverUser = await prisma.user.create({
    data: {
      email: driverEmail,
      password: passwordHash,
      role: 'DRIVER',
      name: 'Reporter Terramar',
      phone: '+5517000000001',
      cpf: '00000000001',
      emailVerified: true,
      phoneVerified: true
    }
  });

  const driver = await prisma.driver.create({
    data: {
      userId: driverUser.id,
      approved: false,
      licenseNumber: 'CNH00000001',
      licenseExpiry: new Date('2030-12-31'),
      isAvailable: false,
      isOnline: false,
      rating: 5.0,
      totalRides: 0,
      completedRides: 0,
      latitude: -20.300748,
      longitude: -50.268282,
      currentAddress: 'Ibirá, SP',
      bankAccountNumber: '000000001',
      bankAgency: '0001',
      bankName: 'Banco Teste',
      bankAccountType: 'CORRENTE',
      pixKey: driverEmail,
      profilePictureUrl: null,
      documentsVerified: false
    }
  });

  console.log(`✅ Motorista criado:`);
  console.log(`   Email: ${driverEmail}`);
  console.log(`   ID User: ${driverUser.id}`);
  console.log(`   ID Driver: ${driver.id}`);
  console.log(`   Status: Aguardando aprovação`);

  const passengerUser = await prisma.user.create({
    data: {
      email: passengerEmail,
      password: passwordHash,
      role: 'PASSENGER',
      name: 'Estudio Noticias',
      phone: '+5517000000002',
      cpf: '00000000002',
      emailVerified: true,
      phoneVerified: true
    }
  });

  const passenger = await prisma.passenger.create({
    data: {
      userId: passengerUser.id,
      rating: 5.0,
      totalRides: 0,
      profilePictureUrl: null
    }
  });

  console.log(`\n✅ Passageiro criado:`);
  console.log(`   Email: ${passengerEmail}`);
  console.log(`   ID User: ${passengerUser.id}`);
  console.log(`   ID Passenger: ${passenger.id}`);
  console.log(`   Status: Ativo`);

  console.log('\n🎯 Resumo:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📱 MOTORISTA:');
  console.log(`   Email: ${driverEmail}`);
  console.log(`   Senha: 1979Ojjbia#`);
  console.log(`   ⚠️  Precisa aprovar motorista e veículo no admin`);
  console.log('');
  console.log('👤 PASSAGEIRO:');
  console.log(`   Email: ${passengerEmail}`);
  console.log(`   Senha: 1979Ojjbia#`);
  console.log(`   ⚠️  ATENÇÃO: Email com erro de digitação (gmsil.com)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch((e) => {
    console.error('❌ Erro:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
