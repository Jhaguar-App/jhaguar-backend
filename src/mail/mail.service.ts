import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private templates = new Map<string, handlebars.TemplateDelegate>();
  private apiKey: string;
  private from: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get('RESEND_API_KEY', '');
    this.from = this.configService.get('MAIL_FROM', 'Jhaguar <onboarding@resend.dev>');
  }

  onModuleInit() {
    this.loadTemplates();
    if (!this.apiKey) {
      this.logger.warn('RESEND_API_KEY not configured - emails will not be sent');
    } else {
      this.logger.log(`Mail service initialized with Resend API (from: ${this.from})`);
    }
  }

  private loadTemplates() {
    const templatesDir = path.join(__dirname, 'templates');
    const templateFiles = ['verify-email', 'reset-password', 'welcome'];

    for (const name of templateFiles) {
      try {
        const filePath = path.join(templatesDir, `${name}.hbs`);
        const source = fs.readFileSync(filePath, 'utf8');
        this.templates.set(name, handlebars.compile(source));
      } catch (error) {
        this.logger.error(`Failed to load template ${name}: ${error.message}`);
      }
    }
  }

  private renderTemplate(name: string, context: Record<string, any>): string {
    const template = this.templates.get(name);
    if (!template) {
      throw new Error(`Template ${name} not found`);
    }
    return template(context);
  }

  private async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.apiKey) {
      this.logger.error('Cannot send email: RESEND_API_KEY not configured');
      return false;
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: [to],
          subject,
          html,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Resend API error ${response.status}: ${errorData}`);
      }

      const data = await response.json();
      this.logger.log(`Email sent to ${to} (id: ${data.id})`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`);
      return false;
    }
  }

  async sendVerificationCode(email: string, firstName: string, code: string): Promise<boolean> {
    const html = this.renderTemplate('verify-email', {
      firstName,
      code,
      year: new Date().getFullYear(),
    });
    return this.sendEmail(email, 'Jhaguar - Confirme seu e-mail', html);
  }

  async sendPasswordResetCode(email: string, firstName: string, code: string): Promise<boolean> {
    const html = this.renderTemplate('reset-password', {
      firstName,
      code,
      year: new Date().getFullYear(),
    });
    return this.sendEmail(email, 'Jhaguar - Redefinir sua senha', html);
  }

  async sendWelcome(email: string, firstName: string): Promise<boolean> {
    const html = this.renderTemplate('welcome', {
      firstName,
      year: new Date().getFullYear(),
    });
    return this.sendEmail(email, 'Bem-vindo ao Jhaguar!', html);
  }
}
