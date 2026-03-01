import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class ChangeEmailDto {
  @ApiProperty({
    description: 'Senha atual do usuário para confirmação',
    example: 'SenhaAtual@123',
  })
  @IsString()
  @IsNotEmpty({ message: 'Senha atual é obrigatória' })
  currentPassword: string;

  @ApiProperty({
    description: 'Novo e-mail do usuário',
    example: 'novoemail@example.com',
  })
  @IsEmail({}, { message: 'E-mail inválido' })
  @IsNotEmpty({ message: 'Novo e-mail é obrigatório' })
  newEmail: string;
}
