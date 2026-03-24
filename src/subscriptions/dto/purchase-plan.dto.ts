import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class PurchasePlanDto {
  @IsNotEmpty()
  @IsString()
  @IsUUID()
  planId: string;
}
