import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WebhookGuard implements CanActivate {
  private readonly logger = new Logger(WebhookGuard.name);
  private readonly webhookToken: string;

  constructor(private readonly configService: ConfigService) {
    this.webhookToken = this.configService.get<string>('ASAAS_WEBHOOK_TOKEN') || '';
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = request.headers['asaas-access-token'] || request.headers['x-webhook-token'];

    if (!this.webhookToken) {
      this.logger.warn('ASAAS_WEBHOOK_TOKEN não configurado. Webhook aceito sem validação.');
      return true;
    }

    if (!token) {
      this.logger.error('Token de webhook não fornecido');
      throw new UnauthorizedException('Token de autenticação não fornecido');
    }

    if (token !== this.webhookToken) {
      this.logger.error('Token de webhook inválido');
      throw new UnauthorizedException('Token de autenticação inválido');
    }

    this.logger.log('Webhook autenticado com sucesso');
    return true;
  }
}
