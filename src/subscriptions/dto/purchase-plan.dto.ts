import { IsNotEmpty, IsString, IsUUID, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AsaasBillingType } from '../../asaas/interfaces/asaas.interfaces';

export class PurchasePlanDto {
  @ApiProperty({ description: 'ID do plano de assinatura' })
  @IsNotEmpty()
  @IsString()
  @IsUUID()
  planId: string;

  @ApiPropertyOptional({
    description: 'Tipo de pagamento (PIX, CREDIT_CARD, BOLETO)',
    enum: AsaasBillingType,
    default: AsaasBillingType.PIX,
  })
  @IsOptional()
  @IsEnum(AsaasBillingType)
  billingType?: AsaasBillingType;
}
