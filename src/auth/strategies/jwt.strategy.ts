import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
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

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: any) {
    return {
      id: payload.sub,
      email: payload.email,
      isDriver: payload.isDriver,
      isPassenger: payload.isPassenger,
      driverId: payload.driverId,
      passengerId: payload.passengerId,
      driverStatus: payload.driverStatus,
    };
  }
}
