import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { PurchasePlanDto } from './dto';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('plans')
  async getAvailablePlans() {
    return this.subscriptionsService.getAvailablePlans();
  }

  @Get('plans/:id')
  async getPlanById(@Param('id') id: string) {
    return this.subscriptionsService.getPlanById(id);
  }

  @Post('purchase')
  async purchasePlan(@Request() req, @Body() dto: PurchasePlanDto) {
    const driver = await this.getDriverFromUser(req.user.id);
    return this.subscriptionsService.purchasePlan(driver.id, dto);
  }

  @Get('current')
  async getCurrentSubscription(@Request() req) {
    const driver = await this.getDriverFromUser(req.user.id);
    return this.subscriptionsService.getActiveSubscription(driver.id);
  }

  @Get('status')
  async getSubscriptionStatus(@Request() req) {
    const driver = await this.getDriverFromUser(req.user.id);
    return this.subscriptionsService.checkSubscriptionStatus(driver.id);
  }

  @Get('history')
  async getSubscriptionHistory(@Request() req) {
    const driver = await this.getDriverFromUser(req.user.id);
    return this.subscriptionsService.getSubscriptionHistory(driver.id);
  }

  private async getDriverFromUser(userId: string) {
    const driver = await this.subscriptionsService['prisma'].driver.findUnique({
      where: { userId },
    });

    if (!driver) {
      throw new Error('Motorista não encontrado');
    }

    return driver;
  }
}
