import { IsString, IsNotEmpty, Matches, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreditCardPaymentDto {
  @ApiProperty({
    description: 'Número do cartão de crédito',
    example: '5162306219378829',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{13,19}$/, { message: 'Número de cartão inválido' })
  cardNumber: string;

  @ApiProperty({
    description: 'Nome impresso no cartão',
    example: 'JOAO SILVA',
  })
  @IsString()
  @IsNotEmpty()
  holderName: string;

  @ApiProperty({
    description: 'Mês de expiração (MM)',
    example: '12',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^(0[1-9]|1[0-2])$/, { message: 'Mês inválido' })
  expiryMonth: string;

  @ApiProperty({
    description: 'Ano de expiração (YYYY)',
    example: '2028',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^20\d{2}$/, { message: 'Ano inválido' })
  expiryYear: string;

  @ApiProperty({
    description: 'Código de segurança (CVV)',
    example: '123',
  })
  @IsString()
  @IsNotEmpty()
  @Length(3, 4)
  @Matches(/^\d{3,4}$/, { message: 'CVV inválido' })
  cvv: string;

  @ApiProperty({
    description: 'CPF do titular do cartão',
    example: '12345678900',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{11}$/, { message: 'CPF inválido' })
  cpfCnpj: string;

  @ApiProperty({
    description: 'CEP do endereço de cobrança',
    example: '01310100',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{8}$/, { message: 'CEP inválido' })
  postalCode: string;

  @ApiProperty({
    description: 'Número do endereço',
    example: '1000',
  })
  @IsString()
  @IsNotEmpty()
  addressNumber: string;

  @ApiProperty({
    description: 'Telefone do titular',
    example: '11999999999',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{10,11}$/, { message: 'Telefone inválido' })
  phone: string;
}
