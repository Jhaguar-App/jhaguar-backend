import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  Query,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiQuery,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { DriversService } from './drivers.service';
import { DriverGateway } from './drivers.gateway';
import { CreateDriverDto } from './dto/create-driver.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { Status } from '@prisma/client';
import { User } from '../auth/decorator/user.decorator';
import { UpdateDriverStatusDto } from './dto/update-driver-status.dto';
import { UpdateDriverLocationDto } from './dto/update-driver-location.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { DriverStatsDto, DriverStatsResponseDto } from './dto/driver-stats.dto';

@ApiTags('Motoristas')
@Controller('drivers')
export class DriversController {
  constructor(
    private readonly driversService: DriversService,
    private readonly driverGateway: DriverGateway,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cadastrar como motorista' })
  @ApiResponse({ status: 201, description: 'Motorista criado com sucesso' })
  async create(@Body() createDriverDto: CreateDriverDto, @User() user: any) {
    if (!createDriverDto.userId) {
      createDriverDto.userId = user.id;
    }
    return this.driversService.create(createDriverDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos os motoristas' })
  @ApiResponse({
    status: 200,
    description: 'Lista de motoristas retornada com sucesso',
  })
  async findAll() {
    return this.driversService.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Buscar um motorista pelo ID' })
  @ApiResponse({ status: 200, description: 'Motorista retornado com sucesso' })
  @ApiResponse({ status: 404, description: 'Motorista não encontrado' })
  async findOne(@Param('id') id: string) {
    return this.driversService.findOne(id);
  }

  @Get('user/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Buscar um motorista pelo ID do usuário' })
  @ApiResponse({ status: 200, description: 'Motorista retornado com sucesso' })
  async findByUserId(@Param('userId') userId: string) {
    return this.driversService.findByUserId(userId);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Atualizar o status de um motorista' })
  @ApiResponse({ status: 200, description: 'Status atualizado com sucesso' })
  @ApiResponse({ status: 404, description: 'Motorista não encontrado' })
  async updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateDriverStatusDto,
  ) {
    return this.driversService.updateStatus(id, updateStatusDto.status);
  }

  @Post(':id/approve')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Aprovar manualmente um motorista (desenvolvimento)',
  })
  @ApiResponse({ status: 200, description: 'Motorista aprovado com sucesso' })
  async approveDriver(@Param('id') id: string) {
    return this.driversService.updateStatus(id, Status.APPROVED);
  }

  @Post(':id/documents')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enviar documentos de motorista' })
  @ApiResponse({ status: 200, description: 'Documentos enviados com sucesso' })
  @ApiResponse({ status: 404, description: 'Motorista não encontrado' })
  async uploadDocuments(@Param('id') id: string, @Body() documentData: any) {
    return this.driversService.updateDocuments(id, documentData);
  }

  @Patch('location')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Atualizar localização do motorista' })
  @ApiResponse({
    status: 200,
    description: 'Localização atualizada com sucesso',
  })
  @ApiResponse({ status: 404, description: 'Motorista não encontrado' })
  async updateLocation(
    @Body() updateLocationDto: UpdateDriverLocationDto,
    @User() user: any,
  ) {
    const locationData = {
      latitude: updateLocationDto.latitude,
      longitude: updateLocationDto.longitude,
      isOnline: updateLocationDto.isOnline ?? true,
      isAvailable: updateLocationDto.isAvailable ?? false,
      heading: updateLocationDto.heading,
      speed: updateLocationDto.speed,
      accuracy: updateLocationDto.accuracy,
    };

    const result = await this.driversService.updateLocationWithCache(
      user.driverId,
      locationData,
    );

    this.driverGateway.server.emit('driver:location-changed', {
      driverId: user.driverId,
      location: {
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        heading: locationData.heading,
        speed: locationData.speed,
        accuracy: locationData.accuracy,
      },
      isOnline: locationData.isOnline,
      isAvailable: locationData.isAvailable,
      timestamp: new Date(),
    });

    if (result.activeRide) {
      const rideRoom = `ride:${result.activeRide.id}`;

      this.driverGateway.server.to(rideRoom).emit('ride:driver-location-update', {
        rideId: result.activeRide.id,
        driverLocation: {
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          heading: locationData.heading,
          speed: locationData.speed,
          accuracy: locationData.accuracy,
        },
        estimatedArrival: result.activeRide.estimatedArrival,
        distanceKm: result.activeRide.distanceKm,
        timestamp: new Date(),
      });

      this.driverGateway.server.to(rideRoom).emit('ride:eta-update', {
        rideId: result.activeRide.id,
        driverLocation: {
          latitude: locationData.latitude,
          longitude: locationData.longitude,
        },
        estimatedArrival: result.activeRide.estimatedArrival,
        distanceKm: result.activeRide.distanceKm,
        timestamp: new Date(),
      });
    }

    return result;
  }

  @Get('online')
  @ApiOperation({ summary: 'Listar motoristas online' })
  @ApiResponse({
    status: 200,
    description: 'Lista de motoristas online retornada com sucesso',
  })
  async findOnlineDrivers() {
    return this.driversService.findOnlineDrivers();
  }

  @Patch(':driverId/status')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Atualizar status do motorista' })
  @ApiResponse({
    status: 200,
    description: 'Status atualizado com sucesso',
    schema: {
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            status: { type: 'string' },
            updatedAt: { type: 'string' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Motorista não encontrado' })
  async updateDriverStatus(
    @Param('driverId') driverId: string,
    @Body() updateStatusDto: UpdateDriverStatusDto,
  ) {
    return this.driversService.updateDriverStatus(
      driverId,
      updateStatusDto.status,
    );
  }

  @Patch(':driverId/availability')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Atualizar disponibilidade do motorista' })
  @ApiResponse({
    status: 200,
    description: 'Disponibilidade atualizada com sucesso',
    schema: {
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            isOnline: { type: 'boolean' },
            isAvailable: { type: 'boolean' },
            onlineAt: { type: 'string', nullable: true },
            offlineAt: { type: 'string', nullable: true },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Motorista não encontrado' })
  async updateAvailability(
    @Param('driverId') driverId: string,
    @Body() updateAvailabilityDto: UpdateAvailabilityDto,
  ) {
    return this.driversService.updateAvailability(
      driverId,
      updateAvailabilityDto,
    );
  }

  @Patch(':driverId/location')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Atualizar localização do motorista específico' })
  @ApiResponse({
    status: 200,
    description: 'Localização atualizada com sucesso',
    schema: {
      properties: {
        id: { type: 'string' },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        isAvailable: { type: 'boolean' },
        isOnline: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Motorista não encontrado' })
  async updateDriverLocation(
    @Param('driverId') driverId: string,
    @Body() updateLocationDto: UpdateDriverLocationDto,
  ) {
    const locationData = {
      latitude: updateLocationDto.latitude,
      longitude: updateLocationDto.longitude,
      isOnline: updateLocationDto.isOnline ?? true,
      isAvailable: updateLocationDto.isAvailable ?? false,
      heading: updateLocationDto.heading,
      speed: updateLocationDto.speed,
      accuracy: updateLocationDto.accuracy,
    };

    const result = await this.driversService.updateLocationWithCache(
      driverId,
      locationData,
    );

    this.driverGateway.server.emit('driver:location-changed', {
      driverId,
      location: {
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        heading: locationData.heading,
        speed: locationData.speed,
        accuracy: locationData.accuracy,
      },
      isOnline: locationData.isOnline,
      isAvailable: locationData.isAvailable,
      timestamp: new Date(),
    });

    if (result.activeRide) {
      const rideRoom = `ride:${result.activeRide.id}`;

      this.driverGateway.server.to(rideRoom).emit('ride:driver-location-update', {
        rideId: result.activeRide.id,
        driverLocation: {
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          heading: locationData.heading,
          speed: locationData.speed,
          accuracy: locationData.accuracy,
        },
        estimatedArrival: result.activeRide.estimatedArrival,
        distanceKm: result.activeRide.distanceKm,
        timestamp: new Date(),
      });

      this.driverGateway.server.to(rideRoom).emit('ride:eta-update', {
        rideId: result.activeRide.id,
        driverLocation: {
          latitude: locationData.latitude,
          longitude: locationData.longitude,
        },
        estimatedArrival: result.activeRide.estimatedArrival,
        distanceKm: result.activeRide.distanceKm,
        timestamp: new Date(),
      });
    }

    return result;
  }

  @Get(':driverId/stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obter estatísticas do motorista' })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['today', 'week', 'month'],
    description: 'Período para consulta das estatísticas',
  })
  @ApiResponse({
    status: 200,
    description: 'Estatísticas retornadas com sucesso',
    type: DriverStatsResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Motorista não encontrado' })
  async getDriverStats(
    @Param('driverId') driverId: string,
    @Query() statsQuery: DriverStatsDto,
  ) {
    return this.driversService.getDriverStats(driverId, statsQuery.period);
  }

  @Get('debug/online-status')
  @ApiOperation({ summary: 'Debug: Verificar status de motoristas online' })
  @ApiResponse({
    status: 200,
    description: 'Status dos motoristas retornado com sucesso',
    schema: {
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            totalDrivers: { type: 'number' },
            onlineDrivers: { type: 'number' },
            availableDrivers: { type: 'number' },
            approvedDrivers: { type: 'number' },
            drivers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  isOnline: { type: 'boolean' },
                  isAvailable: { type: 'boolean' },
                  accountStatus: { type: 'string' },
                  hasLocation: { type: 'boolean' },
                  rideTypes: { type: 'array' },
                },
              },
            },
          },
        },
      },
    },
  })
  async debugOnlineStatus() {
    return this.driversService.debugOnlineStatus();
  }
}
