import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function unlockUser(email: string) {
  try {
    console.log(`🔓 Desbloqueando usuário: ${email}`);

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        failedLoginAttempts: true,
        accountLockedUntil: true,
      },
    });

    if (!user) {
      console.error(`❌ Usuário não encontrado: ${email}`);
      process.exit(1);
    }

    console.log('\n📋 Status atual do usuário:');
    console.log(`   Nome: ${user.firstName} ${user.lastName}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Tentativas falhas: ${user.failedLoginAttempts}`);
    console.log(`   Bloqueado até: ${user.accountLockedUntil || 'Não bloqueado'}`);

    const updated = await prisma.user.update({
      where: { email },
      data: {
        failedLoginAttempts: 0,
        accountLockedUntil: null,
      },
    });

    console.log('\n✅ Usuário desbloqueado com sucesso!');
    console.log(`   Tentativas falhas resetadas: ${updated.failedLoginAttempts}`);
    console.log(`   Bloqueio removido: ${updated.accountLockedUntil === null ? 'Sim' : 'Não'}`);
    console.log('\n🎉 O usuário já pode fazer login novamente!');

  } catch (error) {
    console.error('❌ Erro ao desbloquear usuário:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Executar
const email = process.argv[2] || 'contato@jhaguar.com';
unlockUser(email);
