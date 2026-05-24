import { Module, forwardRef } from '@nestjs/common';
import { IdempotencyService } from '../common/services/idempotency.service';
import { RedisModule } from '../common/redis/redis.module';
import { RidesController } from './rides.controller';
import { RidesDebugController } from './rides-debug.controller';
import { RidesSyncController } from './rides-sync.controller';
import { RidesService } from './rides.service';
import { RidesStateService } from './rides-state.service';
import { RidesCleanupService } from './rides-cleanup.service';
import { RidesValidationService } from './rides-validation.service';
import { RideGateway } from './rides.gateway';
import { MapsModule } from '../maps/maps.module';
import { RideTypesModule } from '../ride-types/ride-types.module';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { ChatModule } from '../chat/chat.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RatingsModule } from '../ratings/ratings.module';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
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
    MapsModule,
    RideTypesModule,
    PaymentsModule,
    forwardRef(() => NotificationsModule),
    forwardRef(() => ChatModule),
    RedisModule,
    RatingsModule,
  ],
  controllers: [RidesController, RidesDebugController, RidesSyncController],
  providers: [
    RidesService,
    RidesStateService,
    RidesCleanupService,
    RidesValidationService,
    RideGateway,
    IdempotencyService,
  ],
  exports: [RidesService, RideGateway],
})
export class RidesModule {}
