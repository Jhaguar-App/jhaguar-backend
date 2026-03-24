export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
  PENDING_PAYMENT = 'PENDING_PAYMENT',
}

export class SubscriptionResponseDto {
  id: string;
  driverId: string;
  planId: string;
  planName: string;
  planType: string;
  status: SubscriptionStatus;
  startDate: Date | null;
  endDate: Date | null;
  amount: number;
  createdAt: Date;
}

export class PlanResponseDto {
  id: string;
  type: string;
  name: string;
  description: string | null;
  price: number;
  durationDays: number;
  isActive: boolean;
}

export class PurchaseResponseDto {
  subscriptionId: string;
  clientSecret: string;
  amount: number;
  planName: string;
}
