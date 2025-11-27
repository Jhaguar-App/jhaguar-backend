import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Patch,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminGuard } from './guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Status, RideTypeEnum } from '@prisma/client';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  async getStats() {
    return this.adminService.getStats();
  }

  @Get('drivers')
  async getDrivers(
    @Query('page', ParseIntPipe) page: number = 1,
    @Query('limit', ParseIntPipe) limit: number = 10,
    @Query('status') status?: Status,
    @Query('search') search?: string,
  ) {
    return this.adminService.getDrivers(page, limit, status, search);
  }

  @Get('drivers/:id')
  async getDriver(@Param('id') id: string) {
    return this.adminService.getDriver(id);
  }

  @Patch('drivers/:id/status')
  async updateDriverStatus(
    @Param('id') id: string,
    @Body('status') status: Status,
  ) {
    return this.adminService.updateDriverStatus(id, status);
  }

  @Patch('drivers/:id/vehicle-status')
  async updateVehicleStatus(
    @Param('id') id: string, // This is driverId based on service logic, but let's verify. Service uses driverId to find vehicle.
    @Body('status') status: Status,
  ) {
    return this.adminService.updateVehicleStatus(id, status);
  }

  @Patch('drivers/:id/categories')
  async updateDriverCategories(
    @Param('id') id: string,
    @Body('categories') categories: RideTypeEnum[],
  ) {
    return this.adminService.updateDriverCategories(id, categories);
  }

  @Get('users')
  async getUsers(
    @Query('page', ParseIntPipe) page: number = 1,
    @Query('limit', ParseIntPipe) limit: number = 10,
    @Query('search') search?: string,
  ) {
    return this.adminService.getUsers(page, limit, search);
  }
}
