-- AlterTable
ALTER TABLE "Driver" ADD COLUMN IF NOT EXISTS "currentSubscriptionId" TEXT,
ADD COLUMN IF NOT EXISTS "subscriptionStatus" "SubscriptionStatus",
ADD COLUMN IF NOT EXISTS "subscriptionExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Driver_currentSubscriptionId_idx" ON "Driver"("currentSubscriptionId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'Driver_currentSubscriptionId_fkey'
    ) THEN
        ALTER TABLE "Driver" ADD CONSTRAINT "Driver_currentSubscriptionId_fkey"
        FOREIGN KEY ("currentSubscriptionId") REFERENCES "driver_subscriptions"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
