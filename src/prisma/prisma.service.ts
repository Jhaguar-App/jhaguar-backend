import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? ['query', 'info', 'warn', 'error']
          : ['error'],
    });
  }

  async onModuleInit() {
    await this.connectWithRetry();
  }

  private async connectWithRetry(retries = 10, delay = 3000) {
    for (let i = 0; i < retries; i++) {
      try {
        await this.$connect();
        this.logger.log('Successfully connected to database');
        return;
      } catch (error) {
        this.logger.error(
          `Failed to connect to database (attempt ${i + 1}/${retries}): ${error.message}`,
        );
        if (i === retries - 1) {
          this.logger.error('All connection attempts failed');
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
