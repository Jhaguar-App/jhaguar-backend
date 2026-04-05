import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionsService } from './subscriptions.service';
import { PurchasePlanDto } from './dto';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
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

  @Get('validate')
  async validateSubscription(@Request() req) {
    try {
      const driver = await this.getDriverFromUser(req.user.id);
      const result = await this.subscriptionsService.checkSubscriptionStatus(driver.id);

      return {
        canGoOnline: result.hasActiveSubscription,
        subscription: result.subscription,
        requiresAction: !result.hasActiveSubscription ? 'PURCHASE_PLAN' : null,
        message: result.hasActiveSubscription
          ? 'Assinatura ativa'
          : 'Você precisa de um plano ativo para ficar online',
      };
    } catch (error) {
      return {
        canGoOnline: false,
        subscription: null,
        requiresAction: 'PURCHASE_PLAN',
        message: 'Você precisa de um plano ativo para ficar online',
      };
    }
  }

  @Get('history')
  async getSubscriptionHistory(@Request() req) {
    const driver = await this.getDriverFromUser(req.user.id);
    return this.subscriptionsService.getSubscriptionHistory(driver.id);
  }

  private async getDriverFromUser(userId: string) {
    return this.subscriptionsService.getDriverFromUserId(userId);
  }
}
