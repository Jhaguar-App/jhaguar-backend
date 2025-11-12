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
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getWebSocketCorsConfig } from '../common/config/cors.config';

@WebSocketGateway({
  cors: getWebSocketCorsConfig(),
  namespace: '/notifications',
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private connectedUsers = new Map<
    string,
    { socketId: string; userId: string; userType: 'driver' | 'passenger' }
  >();
  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: Socket) {
    const userId = this.extractUserId(client);
    const userType = this.extractUserType(client);

    this.logger.log(
      `User connected to notifications: ${client.id}, userId: ${userId}, type: ${userType}`,
    );

    if (userId && userType) {
      this.connectedUsers.set(client.id, {
        socketId: client.id,
        userId,
        userType,
      });
      client.join(`user:${userId}`);
    }
  }

  handleDisconnect(client: Socket) {
    const userData = this.connectedUsers.get(client.id);
    this.logger.log(
      `User disconnected from notifications: ${client.id}, userId: ${userData?.userId}`,
    );

    if (userData) {
      client.leave(`user:${userData.userId}`);
      this.connectedUsers.delete(client.id);
    }
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; userType: 'driver' | 'passenger' },
  ) {
    this.logger.log(
      `User subscribing to notifications: ${data.userId}, type: ${data.userType}`,
    );
    client.join(`user:${data.userId}`);
    client.join(`type:${data.userType}`);

    this.connectedUsers.set(client.id, {
      socketId: client.id,
      userId: data.userId,
      userType: data.userType,
    });

    client.emit('subscribed', {
      success: true,
      userId: data.userId,
      userType: data.userType,
      timestamp: new Date(),
    });
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(@ConnectedSocket() client: Socket) {
    const userData = this.connectedUsers.get(client.id);
    if (userData) {
      client.leave(`user:${userData.userId}`);
      client.leave(`type:${userData.userType}`);
      this.connectedUsers.delete(client.id);
    }
  }

  // Métodos para enviar notificações específicas
  sendToUser(userId: string, event: string, data: any) {
    this.logger.log(`Sending ${event} to user ${userId}`);
    this.server.to(`user:${userId}`).emit(event, {
      ...data,
      timestamp: new Date(),
    });
  }

  sendToDrivers(event: string, data: any) {
    this.logger.log(`Broadcasting ${event} to all drivers`);
    this.server.to('type:driver').emit(event, {
      ...data,
      timestamp: new Date(),
    });
  }

  sendToPassengers(event: string, data: any) {
    this.logger.log(`Broadcasting ${event} to all passengers`);
    this.server.to('type:passenger').emit(event, {
      ...data,
      timestamp: new Date(),
    });
  }

  // Notificações específicas para corridas
  notifyRideAccepted(passengerId: string, rideData: any) {
    this.sendToUser(passengerId, 'ride:accepted', {
      type: 'RIDE_ACCEPTED',
      ride: rideData,
      message: 'Sua corrida foi aceita!',
    });
  }

  notifyDriverArrived(
    passengerId: string,
    rideId: string,
    estimatedWaitTime?: number,
  ) {
    this.sendToUser(passengerId, 'ride:driver-arrived', {
      type: 'DRIVER_ARRIVED',
      rideId,
      estimatedWaitTime,
      message: 'Seu motorista chegou ao local de embarque',
    });
  }

  notifyRideStarted(passengerId: string, rideId: string) {
    this.sendToUser(passengerId, 'ride:started', {
      type: 'RIDE_STARTED',
      rideId,
      message: 'Sua corrida foi iniciada',
    });
  }

  notifyRideCompleted(passengerId: string, rideId: string, summary: any) {
    this.sendToUser(passengerId, 'ride:completed', {
      type: 'RIDE_COMPLETED',
      rideId,
      summary,
      message: 'Sua corrida foi finalizada',
    });
  }

  notifyRideCancelled(
    userId: string,
    rideId: string,
    reason: string,
    cancelledBy: 'driver' | 'passenger',
  ) {
    this.sendToUser(userId, 'ride:cancelled', {
      type: 'RIDE_CANCELLED',
      rideId,
      reason,
      cancelledBy,
      message: 'Sua corrida foi cancelada',
    });
  }

  notifyNewRideRequest(driverId: string, rideRequest: any) {
    this.sendToUser(driverId, 'ride:new-request', {
      type: 'NEW_RIDE_REQUEST',
      request: rideRequest,
      message: 'Nova solicitação de corrida',
    });
  }

  notifyPaymentStatusChanged(
    userId: string,
    rideId: string,
    paymentStatus: string,
  ) {
    this.sendToUser(userId, 'payment:status-changed', {
      type: 'PAYMENT_STATUS_CHANGED',
      rideId,
      paymentStatus,
      message: 'Status do pagamento atualizado',
    });
  }

  // Notificações de sistema
  broadcastSystemMaintenance(message: string, estimatedDuration?: number) {
    this.server.emit('system:maintenance', {
      type: 'SYSTEM_MAINTENANCE',
      message,
      estimatedDuration,
      timestamp: new Date(),
    });
  }

  broadcastSurgeAlert(region: string, surgeMultiplier: number) {
    this.server.emit('system:surge-alert', {
      type: 'SURGE_ALERT',
      region,
      surgeMultiplier,
      message: `Preço dinâmico ativo na região ${region}: ${surgeMultiplier}x`,
      timestamp: new Date(),
    });
  }

  // Métodos utilitários
  getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }

  getConnectedDriversCount(): number {
    return Array.from(this.connectedUsers.values()).filter(
      (user) => user.userType === 'driver',
    ).length;
  }

  getConnectedPassengersCount(): number {
    return Array.from(this.connectedUsers.values()).filter(
      (user) => user.userType === 'passenger',
    ).length;
  }

  isUserConnected(userId: string): boolean {
    return Array.from(this.connectedUsers.values()).some(
      (user) => user.userId === userId,
    );
  }

  private extractUserId(client: Socket): string | null {
    const token =
      client.handshake.auth?.token ||
      client.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      this.logger.warn(`No token provided for socket ${client.id}`);
      client.disconnect();
      return null;
    }

    try {
      const payload = this.jwtService.verify(token);
      return payload.sub || payload.id;
    } catch (error) {
      this.logger.error(
        `Invalid JWT token for socket ${client.id}: ${error.message}`,
      );
      client.disconnect();
      return null;
    }
  }

  private extractUserType(client: Socket): 'driver' | 'passenger' | null {
    const userType = client.handshake.query.userType as string;
    if (userType === 'driver' || userType === 'passenger') {
      return userType;
    }
    return null;
  }
}
