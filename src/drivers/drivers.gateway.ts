import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { LocationUpdateDto } from './dto/location-update.dto';
import { DriversService } from './drivers.service';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getWebSocketCorsConfig } from '../common/config/cors.config';

@WebSocketGateway({
  cors: getWebSocketCorsConfig(),
})
export class DriverGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private connectedDrivers = new Map<string, string>();
  private readonly logger = new Logger(DriverGateway.name);

  constructor(
    private driversService: DriversService,
    private jwtService: JwtService,
  ) {}

  async handleConnection(client: Socket) {
    const driverId = await this.extractDriverId(client);
    this.logger.log(`Driver connected: ${client.id}, driverId: ${driverId}`);

    if (driverId) {
      this.connectedDrivers.set(client.id, driverId);
      client.join(`driver:${driverId}`);

      try {
        // Apenas registrar conexão, sem alterar status no banco
        await this.driversService.updateAvailability(driverId, {
          isOnline: true,
          isAvailable: false,
        });
        this.logger.log(
          `✅ Driver ${driverId} WebSocket connected (status unchanged)`,
        );
      } catch (error) {
        this.logger.error(
          `❌ Failed to set driver ${driverId} online: ${error.message}`,
        );
      }

      this.logger.log(`Driver ${driverId} joined room driver:${driverId}`);
    }
  }

  async handleDisconnect(client: Socket) {
    const driverId = this.connectedDrivers.get(client.id);
    this.logger.log(`Driver disconnected: ${client.id}, driverId: ${driverId}`);

    if (driverId) {
      this.connectedDrivers.delete(client.id);
      client.leave(`driver:${driverId}`);

      try {
        await this.driversService.updateAvailability(driverId, {
          isOnline: false,
          isAvailable: false,
        });
        this.logger.log(
          `✅ Driver ${driverId} automatically set to OFFLINE in database`,
        );
      } catch (error) {
        this.logger.error(
          `❌ Failed to set driver ${driverId} offline: ${error.message}`,
        );
      }

      this.logger.log(`Driver ${driverId} left room driver:${driverId}`);
    }
  }

  @SubscribeMessage('driver:start-receiving-rides')
  async handleDriverStartReceivingRides(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      driverId: string;
      location?: { latitude: number; longitude: number };
    },
  ) {
    this.logger.log(`Driver ${data.driverId} starting to receive rides`);

    try {
      await this.driversService.updateAvailability(data.driverId, {
        isOnline: true,
        isAvailable: true,
        currentLocation: data.location,
      });

      client.emit('driver:availability-updated', {
        isAvailable: true,
        message: 'Agora você está disponível para receber corridas',
        timestamp: new Date(),
      });

      this.server.emit('driver:status-changed', {
        driverId: data.driverId,
        status: 'available',
        timestamp: new Date(),
      });

      this.logger.log(`✅ Driver ${data.driverId} is now AVAILABLE for rides`);
    } catch (error) {
      this.logger.error(`❌ Failed to make driver available: ${error.message}`);
      client.emit('error', {
        message: 'Erro ao ficar disponível para corridas',
        code: 'AVAILABILITY_ERROR',
      });
    }
  }

  @SubscribeMessage('driver:stop-receiving-rides')
  async handleDriverStopReceivingRides(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { driverId: string },
  ) {
    this.logger.log(`Driver ${data.driverId} stopping to receive rides`);

    try {
      await this.driversService.updateAvailability(data.driverId, {
        isOnline: true,
        isAvailable: false,
      });

      client.emit('driver:availability-updated', {
        isAvailable: false,
        message: 'Você não está mais disponível para corridas',
        timestamp: new Date(),
      });

      this.server.emit('driver:status-changed', {
        driverId: data.driverId,
        status: 'unavailable',
        timestamp: new Date(),
      });

      this.logger.log(
        `✅ Driver ${data.driverId} is now UNAVAILABLE for rides`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Failed to make driver unavailable: ${error.message}`,
      );
      client.emit('error', {
        message: 'Erro ao parar de receber corridas',
        code: 'AVAILABILITY_ERROR',
      });
    }
  }

  @SubscribeMessage('driver:offline')
  handleDriverOffline(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { driverId: string },
  ) {
    this.logger.log(`Driver going offline: ${data.driverId}`);
    client.leave(`driver:${data.driverId}`);

    this.server.emit('driver:status-changed', {
      driverId: data.driverId,
      status: 'offline',
      timestamp: new Date(),
    });
  }

  @SubscribeMessage('driver:location-update')
  async handleLocationUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: LocationUpdateDto & { driverId: string },
  ) {
    try {
      await this.driversService.updateLocationWithCache(data.driverId, data);

      this.server.emit('driver:location-changed', {
        driverId: data.driverId,
        location: {
          latitude: data.latitude,
          longitude: data.longitude,
          heading: data.heading,
          speed: data.speed,
          accuracy: data.accuracy,
        },
        isOnline: data.isOnline,
        isAvailable: data.isAvailable,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error(`Error updating driver location: ${error.message}`);
      client.emit('error', {
        message: 'Erro ao atualizar localização',
        code: 'LOCATION_UPDATE_ERROR',
      });
    }
  }

  @SubscribeMessage('driver:accept-ride')
  async handleAcceptRide(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      rideId: string;
      driverId: string;
      acceptedAt: string;
      currentLocation?: { latitude: number; longitude: number };
      estimatedPickupTime?: number;
    },
  ) {
    try {
      this.logger.log(`Driver ${data.driverId} accepting ride ${data.rideId}`);

      const result = await this.driversService.acceptRideRequest(
        data.driverId,
        data.rideId,
        {
          currentLocation: data.currentLocation || {
            latitude: 0,
            longitude: 0,
          },
          estimatedPickupTime: data.estimatedPickupTime || 10,
        },
      );

      if (result.success) {
        client.emit('ride:accept-confirmed', {
          rideId: data.rideId,
          status: 'accepted',
          timestamp: new Date(),
        });

        this.server.emit('ride:driver-accepted', {
          rideId: data.rideId,
          driverId: data.driverId,
          acceptedAt: data.acceptedAt,
          timestamp: new Date(),
        });
      } else {
        throw new Error(result.message || 'Falha ao aceitar corrida');
      }
    } catch (error) {
      this.logger.error(`Error accepting ride: ${error.message}`);
      client.emit('error', {
        message: 'Erro ao aceitar corrida',
        code: 'ACCEPT_RIDE_ERROR',
        rideId: data.rideId,
      });
    }
  }

  @SubscribeMessage('driver:reject-ride')
  async handleRejectRide(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      rideId: string;
      driverId: string;
      reason?: string;
      rejectedAt: string;
    },
  ) {
    try {
      this.logger.log(`Driver ${data.driverId} rejecting ride ${data.rideId}`);

      // Emitir para o sistema de corridas que a corrida foi rejeitada
      this.server.emit('ride:driver-rejected', {
        rideId: data.rideId,
        driverId: data.driverId,
        reason: data.reason || 'Não disponível no momento',
        rejectedAt: data.rejectedAt,
        timestamp: new Date(),
      });

      // Confirmar para o motorista que a ação foi processada
      client.emit('ride:reject-confirmed', {
        rideId: data.rideId,
        status: 'rejected',
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error(`Error rejecting ride: ${error.message}`);
      client.emit('error', {
        message: 'Erro ao rejeitar corrida',
        code: 'REJECT_RIDE_ERROR',
        rideId: data.rideId,
      });
    }
  }

  @SubscribeMessage('driver:status-update')
  async handleDriverStatusUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { driverId: string; status: string; timestamp: string },
  ) {
    try {
      this.logger.log(
        `Driver ${data.driverId} updating status to ${data.status}`,
      );

      // Broadcast status change
      this.server.emit('driver:status-changed', {
        driverId: data.driverId,
        status: data.status,
        timestamp: new Date(),
      });

      // Confirmar para o motorista
      client.emit('driver:status-confirmed', {
        status: data.status,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error(`Error updating driver status: ${error.message}`);
      client.emit('error', {
        message: 'Erro ao atualizar status',
        code: 'STATUS_UPDATE_ERROR',
      });
    }
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    client.emit('pong', { timestamp: new Date() });
  }

  emitNewRideRequest(driverId: string, request: any) {
    this.logger.log(`Emitting new ride request to driver ${driverId}`);
    this.server.to(`driver:${driverId}`).emit('new-ride-request', request);
  }

  emitRideRequestCancelled(driverId: string, rideId: string) {
    this.logger.log(`Emitting ride request cancelled to driver ${driverId}`);
    this.server
      .to(`driver:${driverId}`)
      .emit('ride:request-cancelled', { rideId });
  }

  emitRideStatusUpdate(driverId: string, rideData: any) {
    this.logger.log(`Emitting ride status update to driver ${driverId}`);
    this.server.to(`driver:${driverId}`).emit('ride:status-changed', rideData);
  }

  emitEarningsUpdate(driverId: string, earningsData: any) {
    this.logger.log(`Emitting earnings update to driver ${driverId}`);
    this.server.to(`driver:${driverId}`).emit('earnings:updated', earningsData);
  }

  emitSystemMaintenance(message: string) {
    this.logger.log('Emitting system maintenance notification');
    this.server.emit('system:maintenance', { message, timestamp: new Date() });
  }

  broadcastToAllDrivers(event: string, data: any) {
    this.server.emit(event, data);
  }

  isDriverConnected(driverId: string): boolean {
    const connectedSocketIds = Array.from(this.connectedDrivers.entries())
      .filter(([_, id]) => id === driverId)
      .map(([socketId]) => socketId);

    return connectedSocketIds.length > 0;
  }

  getConnectedDriversCount(): number {
    return this.connectedDrivers.size;
  }

  private async extractDriverId(client: Socket): Promise<string | null> {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.query?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn('No token provided in WebSocket connection');
        return null;
      }

      const payload = this.jwtService.verify(token);
      const userId = payload.sub || payload.userId;

      if (!userId) {
        this.logger.warn('No userId found in JWT payload');
        return null;
      }

      const driver = await this.driversService.findByUserId(userId);
      if (!driver) {
        this.logger.warn(`No driver found for userId: ${userId}`);
        return null;
      }

      return driver.id;
    } catch (error) {
      this.logger.error(
        `Error extracting driver ID from JWT: ${error.message}`,
      );
      return null;
    }
  }
}
