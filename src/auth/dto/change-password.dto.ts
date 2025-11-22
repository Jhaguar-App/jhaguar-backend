import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength, IsStrongPassword } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({
    description: 'Senha atual do usuário',
    example: 'SenhaAntiga@123',
  })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({
    description: 'Nova senha do usuário',
    example: 'NovaSenha@123',
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
  newPassword: string;
}
