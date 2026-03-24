import { IsString, IsNumber, IsEnum, IsOptional, Min, IsEmail } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AsaasBillingType } from '../interfaces/asaas.interfaces';

export class CreateChargeDto {
  @ApiProperty({
    description: 'Nome do cliente',
    example: 'João Silva',
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Email do cliente',
    example: 'joao@example.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Valor da cobrança em reais',
    example: 50.0,
  })
  @IsNumber()
  @Min(5)
  value: number;

  @ApiPropertyOptional({
    description: 'CPF ou CNPJ do cliente',
    example: '12345678900',
  })
  @IsOptional()
  @IsString()
  cpfCnpj?: string;

  @ApiPropertyOptional({
    description: 'Telefone do cliente',
    example: '11999999999',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    description: 'Tipo de cobrança',
    enum: AsaasBillingType,
    example: AsaasBillingType.PIX,
  })
  @IsEnum(AsaasBillingType)
  billingType: AsaasBillingType;

  @ApiPropertyOptional({
    description: 'Descrição da cobrança',
    example: 'Assinatura mensal',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Referência externa (ex: subscriptionId)',
    example: 'sub_123456',
  })
  @IsOptional()
  @IsString()
  externalReference?: string;
}
