import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addVehicleToCarlos() {
  try {
    console.log('🚀 Iniciando processo de adicionar veículo...\n');

    const driverId = '5fb5ce77-ff46-4046-9915-3032f5fa3421';
    const userId = '3a182939-70f1-4221-8aab-f4013a0a5567';

    // PASSO 1: Verificar se motorista existe
    console.log('1️⃣ Verificando motorista...');
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        Driver: true,
      },
    });

    if (!user) {
      throw new Error('❌ Motorista não encontrado!');
    }

    console.log(`✅ Motorista encontrado: ${user.firstName} ${user.lastName}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Status: ${user.driverStatus}\n`);

    // PASSO 2: Verificar se já tem veículo
    console.log('2️⃣ Verificando se já tem veículo...');
    const existingVehicle = await prisma.vehicle.findUnique({
      where: { driverId },
    });

    if (existingVehicle) {
      console.log('⚠️  Motorista já tem veículo cadastrado:');
      console.log(`   ${existingVehicle.make} ${existingVehicle.model}`);
      console.log(`   Tipo: ${existingVehicle.vehicleType}`);
      console.log(`   Pet-Friendly: ${existingVehicle.isPetFriendly}`);
      console.log(`   Blindado: ${existingVehicle.isArmored}\n`);
    } else {
      // PASSO 3: Criar veículo
      console.log('3️⃣ Criando veículo ECONOMY...');
      const vehicle = await prisma.vehicle.create({
        data: {
          driverId,
          make: 'Toyota',
          model: 'Corolla GLI',
          year: 2020,
          color: 'Prata',
          licensePlate: 'ABC-1234',
          registrationExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // +1 ano
          insuranceExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // +1 ano
          vehicleType: 'ECONOMY',
          capacity: 4,
          accessibility: false,
          features: [],
          inspectionStatus: 'APPROVED',
          inspectionDate: new Date(),
          deliveryCapable: false,
          isArmored: false,
          isLuxury: false,
          isMotorcycle: false,
          isPetFriendly: false,
        },
      });

      console.log('✅ Veículo criado com sucesso!');
      console.log(`   ID: ${vehicle.id}`);
      console.log(`   ${vehicle.make} ${vehicle.model} ${vehicle.year}`);
      console.log(`   Tipo: ${vehicle.vehicleType}`);
      console.log(`   Placa: ${vehicle.licensePlate}\n`);
    }

    // PASSO 4: Buscar tipo NORMAL
    console.log('4️⃣ Buscando tipo de corrida NORMAL...');
    const normalRideType = await prisma.rideTypeConfig.findFirst({
      where: {
        type: 'NORMAL',
        isActive: true,
      },
    });

    if (!normalRideType) {
      throw new Error('❌ Tipo de corrida NORMAL não encontrado!');
    }

    console.log(`✅ Tipo NORMAL encontrado:`);
    console.log(`   ID: ${normalRideType.id}`);
    console.log(`   Nome: ${normalRideType.name}\n`);

    // PASSO 5: Verificar se tipo já está associado
    console.log('5️⃣ Verificando associação do tipo NORMAL...');
    const existingAssociation = await prisma.driverRideType.findFirst({
      where: {
        driverId,
        rideTypeId: normalRideType.id,
      },
    });

    if (existingAssociation) {
      console.log('⚠️  Tipo NORMAL já está associado ao motorista');
      console.log(`   Status: ${existingAssociation.isActive ? 'ATIVO' : 'INATIVO'}\n`);

      // Ativar se estiver inativo
      if (!existingAssociation.isActive) {
        await prisma.driverRideType.update({
          where: { id: existingAssociation.id },
          data: { isActive: true },
        });
        console.log('✅ Tipo NORMAL ativado!\n');
      }
    } else {
      // PASSO 6: Associar tipo NORMAL
      console.log('6️⃣ Associando tipo NORMAL ao motorista...');
      const association = await prisma.driverRideType.create({
        data: {
          driverId,
          rideTypeId: normalRideType.id,
          isActive: true,
        },
      });

      console.log('✅ Tipo NORMAL associado com sucesso!');
      console.log(`   ID: ${association.id}\n`);
    }

    // PASSO 7: Aprovar motorista se necessário
    console.log('7️⃣ Verificando status de aprovação...');
    if (user.driverStatus !== 'APPROVED') {
      await prisma.user.update({
        where: { id: userId },
        data: { driverStatus: 'APPROVED' },
      });
      console.log('✅ Motorista aprovado!\n');
    } else {
      console.log('✅ Motorista já está aprovado\n');
    }

    // PASSO 8: Mostrar resumo final
    console.log('═══════════════════════════════════════');
    console.log('📊 RESUMO FINAL');
    console.log('═══════════════════════════════════════\n');

    const finalData = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        Driver: {
          include: {
            Vehicle: true,
            DriverRideType: {
              where: { isActive: true },
              include: {
                RideType: true,
              },
            },
          },
        },
      },
    });

    if (finalData?.Driver) {
      console.log(`👤 Motorista: ${finalData.firstName} ${finalData.lastName}`);
      console.log(`📧 Email: ${finalData.email}`);
      console.log(`✅ Status: ${finalData.driverStatus}`);
      console.log(``);

      if (finalData.Driver.Vehicle) {
        const v = finalData.Driver.Vehicle;
        console.log(`🚗 Veículo: ${v.make} ${v.model} ${v.year}`);
        console.log(`🏷️  Tipo: ${v.vehicleType}`);
        console.log(`📋 Placa: ${v.licensePlate}`);
        console.log(`🐕 Pet-Friendly: ${v.isPetFriendly ? 'Sim' : 'Não'}`);
        console.log(`🛡️  Blindado: ${v.isArmored ? 'Sim' : 'Não'}`);
        console.log(`🏍️  Motocicleta: ${v.isMotorcycle ? 'Sim' : 'Não'}`);
        console.log(``);
      }

      console.log(`📌 Tipos de Corrida Ativos: ${finalData.Driver.DriverRideType.length}`);
      finalData.Driver.DriverRideType.forEach((drt) => {
        console.log(`   ✅ ${drt.RideType.name} (${drt.RideType.type})`);
      });
    }

    console.log('\n═══════════════════════════════════════');
    console.log('🎉 CONCLUÍDO COM SUCESSO!');
    console.log('═══════════════════════════════════════\n');
    console.log('Próximos passos:');
    console.log('1. Force-quit do app no celular');
    console.log('2. Reabra o app');
    console.log('3. Login como motorista');
    console.log('4. Acesse: Dashboard → ⚙️ → Tipos de Corrida');
    console.log('5. Você deverá ver o tipo NORMAL habilitado!\n');

  } catch (error) {
    console.error('❌ Erro:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Executar
addVehicleToCarlos()
  .then(() => {
    console.log('✅ Script finalizado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Falha:', error);
    process.exit(1);
  });
