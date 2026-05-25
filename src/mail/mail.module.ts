import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import * as dns from 'dns';
import { MailService } from './mail.service';

dns.setDefaultResultOrder('ipv4first');

@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const port = config.get<number>('SMTP_PORT', 465);
        return {
          transport: {
            host: config.get('SMTP_HOST', 'smtp.gmail.com'),
            port,
            secure: port === 465,
            auth: {
              user: config.get('SMTP_USER'),
              pass: config.get('SMTP_PASS'),
            },
            tls: {
              rejectUnauthorized: false,
            },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000,
          },
          defaults: {
            from: config.get('MAIL_FROM', '"Jhaguar" <noreply@jhaguar.app>'),
          },
          template: {
            dir: join(__dirname, 'templates'),
            adapter: new HandlebarsAdapter(),
            options: {
              strict: true,
            },
          },
        };
      },
    }),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
