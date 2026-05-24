import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  async sendVerificationCode(email: string, firstName: string, code: string): Promise<boolean> {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Jhaguar - Confirme seu e-mail',
        template: 'verify-email',
        context: {
          firstName,
          code,
          year: new Date().getFullYear(),
        },
      });
      this.logger.log(`Verification email sent to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send verification email to ${email}: ${error.message}`);
      return false;
    }
  }

  async sendPasswordResetCode(email: string, firstName: string, code: string): Promise<boolean> {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Jhaguar - Redefinir sua senha',
        template: 'reset-password',
        context: {
          firstName,
          code,
          year: new Date().getFullYear(),
        },
      });
      this.logger.log(`Password reset email sent to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send reset email to ${email}: ${error.message}`);
      return false;
    }
  }

  async sendWelcome(email: string, firstName: string): Promise<boolean> {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Bem-vindo ao Jhaguar!',
        template: 'welcome',
        context: {
          firstName,
          year: new Date().getFullYear(),
        },
      });
      this.logger.log(`Welcome email sent to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send welcome email to ${email}: ${error.message}`);
      return false;
    }
  }
}
