import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { SubscriptionsService } from './subscriptions.service';
import { CreatePlanDto, UpdatePlanDto, GrantPlanDto } from './dto';

@Controller('subscriptions/admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminSubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('plans')
  async getAllPlans() {
    return this.subscriptionsService.getAllPlans();
  }

  @Post('plans')
  async createPlan(@Body() dto: CreatePlanDto) {
    return this.subscriptionsService.createPlan(dto);
  }

  @Put('plans/:id')
  async updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.subscriptionsService.updatePlan(id, dto);
  }

  @Delete('plans/:id')
  async deletePlan(@Param('id') id: string) {
    return this.subscriptionsService.deletePlan(id);
  }

  @Get('active-subscriptions')
  async getActiveSubscriptions(
    @Query('planType') planType?: string,
    @Query('status') status?: string,
  ) {
    return this.subscriptionsService.getActiveSubscriptionsWithDetails({
      planType,
      status,
    });
  }

  @Get('statistics')
  async getStatistics() {
    return this.subscriptionsService.getStatistics();
  }

  @Get('drivers/:driverId/subscription-info')
  async getDriverSubscriptionInfo(@Param('driverId') driverId: string) {
    const [current, history] = await Promise.all([
      this.subscriptionsService.getActiveSubscription(driverId),
      this.subscriptionsService.getSubscriptionHistory(driverId),
    ]);

    return {
      currentSubscription: current,
      history,
    };
  }

  @Post('drivers/:driverId/grant-plan')
  async grantPlan(@Param('driverId') driverId: string, @Body() dto: GrantPlanDto) {
    return this.subscriptionsService.grantPlan(driverId, dto);
  }

  @Get('expiring-soon')
  async getExpiringSoon(@Query('days', new ParseIntPipe({ optional: true })) days?: number) {
    return this.subscriptionsService.getExpiringSoon(days || 7);
  }
}
