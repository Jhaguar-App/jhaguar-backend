import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({
    example: 'usuario@email.com',
    description: 'Email do usuario',
  })
  @IsEmail({}, { message: 'Email invalido' })
  @IsNotEmpty({ message: 'Email e obrigatorio' })
  email: string;

  @ApiProperty({
    example: '123456',
    description: 'Codigo de verificacao de 6 digitos',
  })
  @IsString()
  @IsNotEmpty({ message: 'Codigo e obrigatorio' })
  @Length(6, 6, { message: 'Codigo deve ter 6 digitos' })
  code: string;
}

export class ResendVerificationDto {
  @ApiProperty({
    example: 'usuario@email.com',
    description: 'Email do usuario',
  })
  @IsEmail({}, { message: 'Email invalido' })
  @IsNotEmpty({ message: 'Email e obrigatorio' })
  email: string;
}
