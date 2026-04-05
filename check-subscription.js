const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkSubscription() {
  try {
    const driverId = 'c56716fe-6bb1-442f-93a1-5ae869437670';

    // Check driver data
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      select: {
        id: true,
        subscriptionStatus: true,
        subscriptionExpiresAt: true,
        currentSubscriptionId: true,
      },
    });

    console.log('📋 DRIVER DATA:');
    console.log(JSON.stringify(driver, null, 2));

    // Check subscriptions
    const subscriptions = await prisma.driverSubscription.findMany({
      where: { driverId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    console.log('\n📋 DRIVER SUBSCRIPTIONS:');
    console.log(JSON.stringify(subscriptions, null, 2));

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSubscription();
