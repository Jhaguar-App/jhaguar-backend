-- Script para criar tabelas de subscription manualmente no PostgreSQL
-- Execute este SQL diretamente no banco de dados via Railway

-- Criar enum de tipos de plano
DO $$ BEGIN
    CREATE TYPE "SubscriptionPlanType" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Criar enum de status de subscription
DO $$ BEGIN
    CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED', 'PENDING_PAYMENT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Criar tabela subscription_plans
CREATE TABLE IF NOT EXISTS "subscription_plans" (
    "id" TEXT NOT NULL,
    "type" "SubscriptionPlanType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- Criar tabela driver_subscriptions
CREATE TABLE IF NOT EXISTS "driver_subscriptions" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "paymentIntentId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_subscriptions_pkey" PRIMARY KEY ("id")
);

-- Criar índices
CREATE INDEX IF NOT EXISTS "driver_subscriptions_driverId_idx" ON "driver_subscriptions"("driverId");
CREATE INDEX IF NOT EXISTS "driver_subscriptions_planId_idx" ON "driver_subscriptions"("planId");
CREATE INDEX IF NOT EXISTS "driver_subscriptions_endDate_idx" ON "driver_subscriptions"("endDate");

-- Adicionar foreign keys
DO $$ BEGIN
    ALTER TABLE "driver_subscriptions" ADD CONSTRAINT "driver_subscriptions_driverId_fkey"
    FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "driver_subscriptions" ADD CONSTRAINT "driver_subscriptions_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Inserir planos padrão
INSERT INTO "subscription_plans" ("id", "type", "name", "description", "price", "durationDays", "isActive", "createdAt", "updatedAt")
VALUES
    (gen_random_uuid()::text, 'WEEKLY', 'Plano Semanal', 'Acesso por 7 dias - Ideal para testar a plataforma', 49.90, 7, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'BIWEEKLY', 'Plano Quinzenal', 'Acesso por 15 dias - Economia de 10%', 89.90, 15, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'MONTHLY', 'Plano Mensal', 'Acesso por 30 dias - Mais popular', 149.90, 30, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'QUARTERLY', 'Plano Trimestral', 'Acesso por 90 dias - Melhor custo-benefício', 399.90, 90, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

-- Atualizar coluna updatedAt automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DO $$ BEGIN
    CREATE TRIGGER update_subscription_plans_updated_at BEFORE UPDATE ON "subscription_plans"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TRIGGER update_driver_subscriptions_updated_at BEFORE UPDATE ON "driver_subscriptions"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
