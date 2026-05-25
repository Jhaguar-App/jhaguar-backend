import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import * as dns from 'dns';
import * as net from 'net';
import * as tls from 'tls';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;
  private templates = new Map<string, handlebars.TemplateDelegate>();
  private from: string;
  private smtpHost: string;
  private smtpPort: number;
  private smtpUser: string;
  private smtpPass: string;
  private resolvedIp: string | null = null;

  constructor(private readonly configService: ConfigService) {
    this.smtpHost = this.configService.get('SMTP_HOST', 'smtp.gmail.com');
    this.smtpPort = this.configService.get<number>('SMTP_PORT', 465);
    this.smtpUser = this.configService.get('SMTP_USER', '');
    this.smtpPass = this.configService.get('SMTP_PASS', '');
    this.from = this.configService.get('MAIL_FROM', '"Jhaguar" <noreply@jhaguar.app>');
  }

  async onModuleInit() {
    await this.resolveSmtpHost();
    this.createTransporter();
    this.loadTemplates();
    this.logger.log(`Mail service initialized (host: ${this.smtpHost} -> ${this.resolvedIp}, port: ${this.smtpPort})`);
  }

  private async resolveSmtpHost() {
    try {
      const addresses = await new Promise<string[]>((resolve, reject) => {
        dns.resolve4(this.smtpHost, (err, addrs) => {
          if (err) reject(err);
          else resolve(addrs);
        });
      });
      this.resolvedIp = addresses[0];
      this.logger.log(`Resolved ${this.smtpHost} to IPv4: ${this.resolvedIp}`);
    } catch (error) {
      this.logger.warn(`Could not resolve ${this.smtpHost} to IPv4, using hostname directly`);
      this.resolvedIp = null;
    }
  }

  private createTransporter() {
    const host = this.resolvedIp || this.smtpHost;
    const isSecure = this.smtpPort === 465;

    this.transporter = nodemailer.createTransport({
      host,
      port: this.smtpPort,
      secure: isSecure,
      auth: {
        user: this.smtpUser,
        pass: this.smtpPass,
      },
      tls: {
        servername: this.smtpHost,
        rejectUnauthorized: false,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    } as nodemailer.TransportOptions);
  }

  private loadTemplates() {
    const templatesDir = path.join(__dirname, 'templates');
    const templateFiles = ['verify-email', 'reset-password', 'welcome'];

    for (const name of templateFiles) {
      try {
        const filePath = path.join(templatesDir, `${name}.hbs`);
        const source = fs.readFileSync(filePath, 'utf8');
        this.templates.set(name, handlebars.compile(source));
        this.logger.log(`Template loaded: ${name}`);
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

  async sendVerificationCode(email: string, firstName: string, code: string): Promise<boolean> {
    try {
      const html = this.renderTemplate('verify-email', {
        firstName,
        code,
        year: new Date().getFullYear(),
      });

      await this.transporter.sendMail({
        from: this.from,
        to: email,
        subject: 'Jhaguar - Confirme seu e-mail',
        html,
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
      const html = this.renderTemplate('reset-password', {
        firstName,
        code,
        year: new Date().getFullYear(),
      });

      await this.transporter.sendMail({
        from: this.from,
        to: email,
        subject: 'Jhaguar - Redefinir sua senha',
        html,
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
      const html = this.renderTemplate('welcome', {
        firstName,
        year: new Date().getFullYear(),
      });

      await this.transporter.sendMail({
        from: this.from,
        to: email,
        subject: 'Bem-vindo ao Jhaguar!',
        html,
      });

      this.logger.log(`Welcome email sent to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send welcome email to ${email}: ${error.message}`);
      return false;
    }
  }
}
