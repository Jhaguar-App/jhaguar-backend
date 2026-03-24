import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed de planos...');

  // Deletar planos existentes (se necessário)
  await prisma.subscriptionPlan.deleteMany({});

  // Criar planos padrão
  const plans = await prisma.$transaction([
    prisma.subscriptionPlan.create({
      data: {
        type: 'WEEKLY',
        name: 'Plano Semanal',
        description: 'Acesso por 7 dias - Ideal para testar a plataforma',
        price: 49.90,
        durationDays: 7,
        isActive: true,
      },
    }),
    prisma.subscriptionPlan.create({
      data: {
        type: 'BIWEEKLY',
        name: 'Plano Quinzenal',
        description: 'Acesso por 15 dias - Economia de 10%',
        price: 89.90,
        durationDays: 15,
        isActive: true,
      },
    }),
    prisma.subscriptionPlan.create({
      data: {
        type: 'MONTHLY',
        name: 'Plano Mensal',
        description: 'Acesso por 30 dias - Mais popular',
        price: 149.90,
        durationDays: 30,
        isActive: true,
      },
    }),
    prisma.subscriptionPlan.create({
      data: {
        type: 'QUARTERLY',
        name: 'Plano Trimestral',
        description: 'Acesso por 90 dias - Melhor custo-benefício',
        price: 399.90,
        durationDays: 90,
        isActive: true,
      },
    }),
  ]);

  console.log('✅ Planos criados com sucesso:');
  plans.forEach(plan => {
    console.log(`   - ${plan.name}: R$ ${plan.price} (${plan.durationDays} dias)`);
  });

  console.log('\n✨ Seed concluído!');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
