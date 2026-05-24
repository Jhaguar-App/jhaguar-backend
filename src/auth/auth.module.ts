import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentsModule } from '../payments/payments.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    PaymentsModule,
    MailModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const jwtSecret = configService.get<string>('JWT_SECRET');

        if (process.env.NODE_ENV === 'production' && !jwtSecret) {
          throw new Error(
            '🔒 ERRO DE SEGURANÇA: JWT_SECRET não configurado em produção! ' +
              'Configure a variável de ambiente JWT_SECRET no Railway.',
          );
        }

        const secret = jwtSecret || 'dev-secret-key-INSECURE';
        if (!jwtSecret) {
          console.warn(
            '⚠️  AVISO: Usando JWT_SECRET padrão de desenvolvimento. ' +
              'Configure JWT_SECRET para produção!',
          );
        }

        return {
          secret,
          signOptions: { expiresIn: '7d' },
        };
      },
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
