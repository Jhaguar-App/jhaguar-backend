import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MinLength,
  Matches,
  IsStrongPassword,
} from 'class-validator';
import { Gender } from '@prisma/client';

export class VehicleDto {
  @ApiProperty({ example: 'Toyota' })
  @IsString()
  @IsNotEmpty()
  make: string;

  @ApiProperty({ example: 'Corolla' })
  @IsString()
  @IsNotEmpty()
  model: string;

  @ApiProperty({ example: 2022 })
  @IsNotEmpty()
  year: number;

  @ApiProperty({ example: 'Prata' })
  @IsString()
  @IsNotEmpty()
  color: string;

  @ApiProperty({ example: 'ABC-1234' })
  @IsString()
  @IsNotEmpty()
  licensePlate: string;
}

export class RegisterDto {
  @ApiProperty({
    description: 'E-mail do usuário',
    example: 'usuario@exemplo.com',
  })
  @IsEmail({}, { message: 'Email inválido' })
  @Matches(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, {
    message: 'Formato de email inválido',
  })
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'Número de telefone do usuário',
    example: '+5511999999999',
  })
  @IsPhoneNumber(undefined, { message: 'Número de telefone inválido' })
  @IsNotEmpty()
  phone: string;

  @ApiProperty({
    description: 'Primeiro nome do usuário',
    example: 'João',
  })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({
    description: 'Sobrenome do usuário',
    example: 'Silva',
  })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({
    description: 'Senha do usuário (mínimo 8 caracteres, contendo letra maiúscula, minúscula, número e caractere especial)',
    example: 'Senha@123',
  })
  @IsString()
  @MinLength(8, { message: 'A senha deve ter no mínimo 8 caracteres' })
  @IsStrongPassword(
    {
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 1,
    },
    {
      message:
        'A senha deve conter pelo menos: 8 caracteres, 1 letra maiúscula, 1 letra minúscula, 1 número e 1 caractere especial',
    },
  )
  @IsNotEmpty()
  password: string;

  @ApiProperty({
    description: 'Gênero do usuário',
    enum: Gender,
    example: Gender.MALE,
  })
  @IsEnum(Gender)
  @IsNotEmpty()
  gender: Gender;

  @ApiProperty({
    description: 'Data de nascimento do usuário',
    example: '1990-01-01',
    required: false,
  })
  @IsOptional()
  dateOfBirth?: Date;

  @ApiProperty({
    description: 'URL da imagem de perfil',
    example: 'https://exemplo.com/imagem.jpg',
    required: false,
  })
  @IsString()
  @IsOptional()
  profileImage?: string;

  @ApiProperty({
    description: 'Endereço do usuário',
    example: 'Rua Exemplo, 123',
    required: false,
  })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({
    description: 'Tipo de usuário',
    enum: ['PASSENGER', 'DRIVER'],
    example: 'PASSENGER',
  })
  @IsEnum(['PASSENGER', 'DRIVER'])
  @IsNotEmpty()
  userType: string;

  @ApiProperty({
    description: 'Dados do veículo (apenas para motoristas)',
    required: false,
  })
  @IsOptional()
  vehicle?: VehicleDto;
}
