import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class GrantPlanDto {
  @IsNotEmpty()
  @IsString()
  @IsUUID()
  planId: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  durationDays?: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
