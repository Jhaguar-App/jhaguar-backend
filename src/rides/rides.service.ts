import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MapsService } from '../maps/maps.service';
import { RideTypesService } from '../ride-types/ride-types.service';
import { PaymentsService } from '../payments/payments.service';
import { IdempotencyService } from '../common/services/idempotency.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RideGateway } from './rides.gateway';
import { ChatService } from '../chat/chat.service';
import { ChatGateway } from '../chat/chat.gateway';
import { RidesStateService } from './rides-state.service';
import { CreateRideDto } from './dto/create-ride.dto';
import { AcceptRideDto } from './dto/accept-ride.dto';
import { RejectRideDto } from './dto/reject-ride.dto';
import { ArrivedDto } from './dto/arrived.dto';
import { StartRideDto } from './dto/start-ride.dto';
import { CompleteRideDto } from './dto/complete-ride.dto';
import { CancelRideDto } from './dto/cancel-ride.dto';
import { RideStatus, PaymentStatus, PaymentMethod } from '@prisma/client';

@Injectable()
export class RidesService {
  private readonly logger = new Logger(RidesService.name);
  private readonly confirmationTokens = new Map<
    string,
    { data: any; expires: Date }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly mapsService: MapsService,
    private readonly rideTypesService: RideTypesService,
    private readonly paymentsService: PaymentsService,
    private readonly idempotency: IdempotencyService,
    @Inject(forwardRef(() => RideGateway))
    private readonly rideGateway: RideGateway,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    private readonly chatService: ChatService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
    private readonly ridesStateService: RidesStateService,
  ) {
    setInterval(() => this.cleanExpiredTokens(), 5 * 60 * 1000);
  }

  async prepareRideConfirmation(
    userId: string,
    confirmationData: {
      origin: { latitude: number; longitude: number; address: string };
      destination: { latitude: number; longitude: number; address: string };
      rideTypeId: string;
      estimatedDistance: number;
      estimatedDuration: number;
      selectedDriverId?: string;
      scheduledTime?: Date;
      specialRequirements?: string;
      hasPets?: boolean;
      petDescription?: string;
    },
  ): Promise<{
    success: boolean;
    data: any;
    message: string;
  }> {
    try {
      const confirmation = await this.mapsService.prepareRideConfirmation(
        userId,
        {
          ...confirmationData,
          estimatedPrice: 0,
        },
      );

      if (confirmation.success) {
        // NOVO: Incluir métodos de pagamento disponíveis
        const paymentMethods = await this.paymentsService.getPaymentMethods(
          userId,
        );

        confirmation.data.paymentMethods = paymentMethods;
        confirmation.data.walletBalance =
          await this.paymentsService.getWalletBalance(userId);

        this.confirmationTokens.set(confirmation.data.confirmationToken, {
          data: {
            userId,
            ...confirmationData,
            pricing: confirmation.data.pricing,
            selectedDriver: confirmation.data.driver,
            paymentMethods,
          },
          expires: confirmation.data.expiresAt,
        });
      }

      return confirmation;
    } catch (error) {
      this.logger.error('Erro ao preparar confirmação:', error);
      return {
        success: false,
        data: null,
        message: error instanceof Error ? error.message : 'Erro interno',
      };
    }
  }

  async createRide(
    userId: string,
    createRideDto: CreateRideDto,
    idempotencyKey?: string,
  ): Promise<{
    success: boolean;
    data: any;
    message: string;
  }> {
    try {
      const exec = async () => {
        const usingToken = Boolean(createRideDto.confirmationToken);
        const tokenData = usingToken
          ? this.confirmationTokens.get(createRideDto.confirmationToken!)
          : null;
        if (usingToken) {
          if (!tokenData) {
            throw new BadRequestException(
              'Token de confirmação inválido ou expirado',
            );
          }
          if (new Date() > tokenData.expires) {
            this.confirmationTokens.delete(createRideDto.confirmationToken!);
            throw new BadRequestException('Token de confirmação expirado');
          }
        }

        const passenger = await this.prisma.passenger.findUnique({
          where: { userId },
          include: { User: true },
        });

        if (!passenger) {
          throw new NotFoundException('Perfil de passageiro não encontrado');
        }

        let selectedDriver: any = null;
        if (
          createRideDto.selectedDriverId ||
          (tokenData && tokenData.data.selectedDriver)
        ) {
          const driverId =
            createRideDto.selectedDriverId || tokenData!.data.selectedDriver.id;
          selectedDriver = await this.prisma.driver.findUnique({
            where: {
              id: driverId,
              isOnline: true,
              isAvailable: true,
              accountStatus: 'APPROVED',
            },
            include: { User: true, Vehicle: true },
          });

          if (!selectedDriver) {
            throw new BadRequestException(
              'Motorista selecionado não está mais disponível',
            );
          }
        }

        const rideType = await this.rideTypesService.findRideTypeById(
          createRideDto.rideTypeId,
        );

        // Validar presença de origem/destino
        if (!createRideDto.origin || !createRideDto.destination) {
          throw new BadRequestException('Origem e destino são obrigatórios');
        }

        const submittedPrice = createRideDto.estimatedPrice || 0;

        let finalPricing;
        if (submittedPrice > 0) {
          const validationResult =
            await this.rideTypesService.calculateRidePrice({
              rideTypeId: createRideDto.rideTypeId,
              distance: createRideDto.estimatedDistance,
              duration: createRideDto.estimatedDuration,
              surgeMultiplier: tokenData?.data?.pricing?.surgeMultiplier || 1.0,
              isPremiumTime: this.isPremiumTime(),
            });

          const priceDifference = Math.abs(
            submittedPrice - validationResult.finalPrice,
          );
          const tolerance = submittedPrice * 0.2;

          if (priceDifference <= tolerance) {
            this.logger.log(
              `✅ Usando preço enviado pelo cliente: R$ ${submittedPrice.toFixed(
                2,
              )} (validação: R$ ${validationResult.finalPrice.toFixed(2)})`,
            );
            finalPricing = {
              ...validationResult,
              finalPrice: submittedPrice,
            };
          } else {
            this.logger.warn(
              `⚠️ Divergência de preço excede tolerância. Cliente: R$ ${submittedPrice.toFixed(
                2,
              )}, Sistema: R$ ${validationResult.finalPrice.toFixed(2)}`,
            );
            finalPricing = validationResult;
          }
        } else {
          finalPricing = await this.rideTypesService.calculateRidePrice({
            rideTypeId: createRideDto.rideTypeId,
            distance: createRideDto.estimatedDistance,
            duration: createRideDto.estimatedDuration,
            surgeMultiplier: tokenData?.data?.pricing?.surgeMultiplier || 1.0,
            isPremiumTime: this.isPremiumTime(),
          });
        }

        // Primeiro, fazer limpeza automática de rides órfãs
        const cleanupResult = await this.ridesStateService.cleanupOrphanedRides(
          userId,
        );
        if (cleanupResult.cleaned > 0) {
          this.logger.log(
            `🧹 Auto-cleanup: ${cleanupResult.cleaned} rides órfãs removidas`,
          );
        }

        // Verificar estado atual do usuário
        const userState = await this.ridesStateService.getUserRideState(userId);
        if (userState.hasActiveRide) {
          const existingRide = await this.prisma.ride.findUnique({
            where: { id: userState.activeRideId },
            include: {
              Passenger: { include: { User: true } },
              Driver: { include: { User: true, Vehicle: true } },
              RideTypeConfig: true,
              Payment: true,
            },
          });

          if (existingRide) {
            const ageMinutes = Math.floor(
              (Date.now() - existingRide.createdAt.getTime()) / (1000 * 60),
            );
            this.logger.warn(
              `Passageiro ${passenger.id} já tem corrida ativa: ${existingRide.id} (status: ${existingRide.status}, idade: ${ageMinutes}min)`,
            );

            // Se a corrida foi aceita por motorista, retornar dados da corrida existente
            if (
              existingRide.status === RideStatus.ACCEPTED ||
              existingRide.status === RideStatus.IN_PROGRESS
            ) {
              this.logger.log(
                `✅ Corrida já foi aceita, retornando dados da corrida existente: ${existingRide.id}`,
              );

              if (existingRide?.Driver) {
                this.rideGateway.emitToRide(existingRide.id, 'ride:accepted', {
                  rideId: existingRide.id,
                  Driver: {
                    id: existingRide.Driver?.id,
                    driverId: existingRide.Driver?.id,
                    driverName: `${
                      existingRide.Driver?.User?.firstName || ''
                    } ${existingRide.Driver?.User?.lastName || ''}`,
                    profileImage: existingRide.Driver?.User?.profileImage,
                    driverRating: existingRide.Driver?.averageRating || 5.0,
                    vehicle: existingRide.Driver?.Vehicle,
                    latitude: existingRide.Driver?.currentLatitude || 0,
                    longitude: existingRide.Driver?.currentLongitude || 0,
                  },
                  estimatedArrival: 5,
                  finalPrice: existingRide.finalPrice,
                  status: existingRide.status,
                });
              }

              return {
                success: true,
                data: this.formatRideResponseDetailed(existingRide),
                message: 'Corrida já foi aceita por um motorista',
              };
            }

            // Para status REQUESTED: cancelar automaticamente e permitir nova corrida (estilo Uber/99)
            if (existingRide.status === RideStatus.REQUESTED) {
              this.logger.log(
                `🧹 Auto-cancelando corrida REQUESTED antiga (${ageMinutes}min) para permitir nova solicitação: ${existingRide.id}`,
              );

              try {
                // Cancelar a corrida antiga
                await this.prisma.ride.update({
                  where: { id: existingRide.id },
                  data: {
                    status: RideStatus.CANCELLED,
                    cancellationReason:
                      'Automaticamente cancelada ao solicitar nova corrida',
                    cancellationTime: new Date(),
                  },
                });

                this.rideGateway.emitToRide(existingRide.id, 'ride:cancelled', {
                  rideId: existingRide.id,
                  reason: 'Nova corrida solicitada',
                  cancelledBy: 'system',
                });

                this.logger.log(
                  `✅ Corrida ${existingRide.id} cancelada automaticamente`,
                );
              } catch (cancelError) {
                this.logger.error(
                  `❌ Erro ao cancelar corrida antiga: ${cancelError.message}`,
                );
              }
            } else {
              throw new BadRequestException({
                message: 'Você já tem uma corrida em andamento',
                details: {
                  rideId: existingRide.id,
                  status: existingRide.status,
                  createdAt: existingRide.createdAt,
                  origin: existingRide.originAddress,
                  destination: existingRide.destinationAddress,
                  ageMinutes,
                },
                code: 'RIDE_ALREADY_EXISTS',
              });
            }
          }
        }

        const effectiveEstimated =
          createRideDto.estimatedPrice ?? finalPricing.finalPrice;
        if (!effectiveEstimated || effectiveEstimated <= 0) {
          throw new BadRequestException('Preço estimado inválido');
        }

        if (createRideDto.estimatedPrice && createRideDto.estimatedPrice > 0) {
          const priceDifference = Math.abs(
            createRideDto.estimatedPrice - finalPricing.finalPrice,
          );
          const priceTolerancePercent = 0.05;
          const maxAllowedDifference =
            finalPricing.finalPrice * priceTolerancePercent;

          if (priceDifference > maxAllowedDifference) {
            this.logger.warn(
              `Price divergence detected: estimated=${createRideDto.estimatedPrice}, calculated=${finalPricing.finalPrice}, difference=${priceDifference}`,
            );
            this.logger.log(
              `Using system-calculated price: ${finalPricing.finalPrice}`,
            );
          }
        }

        const ride = await this.prisma.ride.create({
          data: {
            passengerId: passenger.id,
            driverId: selectedDriver?.id,
            vehicleId: selectedDriver?.vehicle?.id,
            rideTypeConfigId: createRideDto.rideTypeId,
            status: RideStatus.REQUESTED,

            originAddress: createRideDto.origin.address,
            originLatitude: createRideDto.origin.latitude,
            originLongitude: createRideDto.origin.longitude,

            destinationAddress: createRideDto.destination.address,
            destinationLatitude: createRideDto.destination.latitude,
            destinationLongitude: createRideDto.destination.longitude,

            estimatedDistance: createRideDto.estimatedDistance,
            estimatedDuration: createRideDto.estimatedDuration,
            basePrice: finalPricing.basePrice,
            finalPrice: finalPricing.finalPrice,

            hasPets: createRideDto.hasPets || false,
            petDescription: createRideDto.petDescription,
            specialRequirements: createRideDto.specialRequirements,
            baggageQuantity: createRideDto.baggageQuantity || 0,
            scheduledTime: createRideDto.scheduledTime
              ? new Date(createRideDto.scheduledTime)
              : null,

            isFemaleOnlyRide: rideType.femaleOnly,
            isDelivery: rideType.isDeliveryOnly,

            acceptTime: null,
          },
          include: {
            Passenger: {
              include: { User: { include: { UserWallet: true } } },
            },
            Driver: {
              include: {
                User: { include: { UserWallet: true } },
                Vehicle: true,
              },
            },
            RideTypeConfig: true,
          },
        });

        if (selectedDriver) {
          await this.prisma.driver.update({
            where: { id: selectedDriver.id },
            data: {
              isAvailable: false,
              isActiveTrip: true,
            },
          });
        }

        if (usingToken) {
          this.confirmationTokens.delete(createRideDto.confirmationToken!);
        }

        // NOVO: Criar registro de pagamento inicial com método selecionado
        const paymentMethod = createRideDto.paymentMethod || 'CASH';
        console.log(`💳 Criando pagamento com método: ${paymentMethod}`);

        await this.prisma.payment.create({
          data: {
            rideId: ride.id,
            amount: finalPricing.finalPrice,
            status: PaymentStatus.PENDING,
            method: paymentMethod as PaymentMethod,
          },
        });

        if (!selectedDriver) {
          try {
            await this.notifyNearbyDrivers(ride);
          } catch (notifyError) {
            this.logger.warn(
              'Erro ao notificar motoristas próximos:',
              notifyError,
            );
            // Não falha a criação da corrida se notificação falhar
          }
        }

        // NOVO: Incluir informações de pagamento na resposta
        const paymentMethods = await this.paymentsService.getPaymentMethods(
          userId,
        );
        const walletBalance = await this.paymentsService.getWalletBalance(
          userId,
        );

        return {
          success: true,
          data: {
            id: ride.id,
            status: ride.status,
            createdAt: ride.createdAt,
          },
          message: selectedDriver
            ? 'Corrida criada e aceita pelo motorista'
            : 'Corrida criada, buscando motorista disponível',
        };
      };

      if (idempotencyKey) {
        // PRODUÇÃO: TTL de 3 minutos - adequado para conexões móveis com retry automático
        const idempotencyTTL = 3 * 60 * 1000; // 3 minutos
        return await this.idempotency.getOrSet(
          `rides:create:${userId}:${idempotencyKey}`,
          idempotencyTTL,
          exec,
        );
      }

      return await exec();
    } catch (error) {
      this.logger.error('Erro ao criar corrida:', error);
      return {
        success: false,
        data: null,
        message:
          error instanceof Error ? error.message : 'Erro ao criar corrida',
      };
    }
  }

  async getRideByIdForUser(rideId: string, userId: string) {
    const ride = await this.prisma.ride.findFirst({
      where: {
        id: rideId,
        OR: [{ Passenger: { userId } }, { Driver: { userId } }],
      },
      include: {
        Passenger: { include: { User: true } },
        Driver: { include: { User: true, Vehicle: true } },
        RideTypeConfig: true,
      },
    });

    if (!ride) {
      throw new NotFoundException('Corrida não encontrada ou acesso negado');
    }

    return {
      success: true,
      data: {
        id: ride.id,
        status: ride.status,
        Passenger: {
          id: ride.Passenger.id,
          user: {
            firstName: ride.Passenger.User.firstName,
            lastName: ride.Passenger.User.lastName,
            phone: ride.Passenger.User.phone,
            profileImage: ride.Passenger.User.profileImage,
          },
          averageRating: ride.Passenger.averageRating,
          totalRides: ride.Passenger.totalRides,
        },
        driver: ride.Driver
          ? {
              id: ride.Driver.id,
              user: {
                firstName: ride.Driver.User.firstName,
                lastName: ride.Driver.User.lastName,
                phone: ride.Driver.User.phone,
                profileImage: ride.Driver.User.profileImage,
              },
              averageRating: ride.Driver.averageRating,
              totalRides: ride.Driver.totalRides,
              vehicle: ride.Driver.Vehicle
                ? {
                    model: ride.Driver.Vehicle.model,
                    color: ride.Driver.Vehicle.color,
                    licensePlate: ride.Driver.Vehicle.licensePlate,
                    carImageUrl: ride.Driver.Vehicle.carImageUrl || undefined,
                  }
                : null,
            }
          : null,
        originAddress: ride.originAddress,
        originLatitude: ride.originLatitude,
        originLongitude: ride.originLongitude,
        destinationAddress: ride.destinationAddress,
        destinationLatitude: ride.destinationLatitude,
        destinationLongitude: ride.destinationLongitude,
        estimatedArrival: ride.acceptTime
          ? new Date(ride.acceptTime.getTime() + 8 * 60 * 1000)
          : null,
        estimatedDuration: ride.estimatedDuration,
        distanceToDestination: ride.actualDistance || null,
        createdAt: ride.createdAt,
        acceptedAt: ride.acceptTime,
        startedAt: ride.pickupTime,
        completedAt: ride.dropOffTime,
        estimatedPrice: ride.finalPrice || ride.basePrice,
        finalPrice: ride.finalPrice || null,
        rideType: ride.RideTypeConfig
          ? {
              id: ride.RideTypeConfig.id,
              name: ride.RideTypeConfig.name,
              icon: ride.RideTypeConfig.icon,
            }
          : null,
        specialRequirements: ride.specialRequirements,
        hasPets: ride.hasPets,
        rating: null,
      },
    };
  }

  async getRideStatus(rideId: string, userId: string) {
    const ride = await this.prisma.ride.findFirst({
      where: {
        id: rideId,
        OR: [{ Passenger: { userId } }, { Driver: { userId } }],
      },
      include: { Driver: true },
    });
    if (!ride) throw new NotFoundException('Corrida não encontrada');

    let driverLocation: { latitude: number; longitude: number } | undefined;
    if (ride.driverId) {
      const loc = await this.mapsService.getDriverLocationFromDatabase(
        ride.driverId,
      );
      if (loc)
        driverLocation = {
          latitude: loc.latitude,
          longitude: loc.longitude,
        } as any;
    }

    const estimatedArrival = ride.acceptTime
      ? new Date(ride.acceptTime.getTime() + 7 * 60 * 1000)
      : null;

    return {
      success: true,
      data: {
        status: ride.status,
        driverLocation,
        estimatedArrival,
      },
    };
  }

  async rateRide(
    rideId: string,
    userId: string,
    body: { rating: number; review?: string; isPassengerRating?: boolean },
  ) {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) throw new NotFoundException('Corrida não encontrada');

    const isPassengerRating = body.isPassengerRating !== false;
    const passenger = await this.prisma.passenger.findUnique({
      where: { id: ride.passengerId },
    });
    const driver = ride.driverId
      ? await this.prisma.driver.findUnique({ where: { id: ride.driverId } })
      : null;

    const ratedUserId = isPassengerRating ? driver?.userId : passenger?.userId;
    if (!ratedUserId) throw new BadRequestException('Parte avaliada inválida');

    const rating = await this.prisma.rating.create({
      data: {
        rideId,
        ratedByUserId: userId,
        ratedUserId,
        rating: body.rating,
        review: body.review,
      },
    });

    return { success: true, data: { ratingId: rating.id } };
  }

  async reportRide(
    rideId: string,
    userId: string,
    body: {
      issue: string;
      description?: string;
      reportedBy: 'passenger' | 'driver';
    },
  ) {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) throw new NotFoundException('Corrida não encontrada');

    const actorIsPassenger = body.reportedBy === 'passenger';
    const actorValid = actorIsPassenger
      ? await this.prisma.passenger.findFirst({
          where: { userId, id: ride.passengerId },
        })
      : await this.prisma.driver.findFirst({
          where: { userId, id: ride.driverId || '' },
        });
    if (!actorValid) throw new ForbiddenException('Acesso negado');

    const record = await this.prisma.rideStatusHistory.create({
      data: {
        rideId,
        driverId:
          ride.driverId ||
          (
            await this.prisma.driver.findFirst({ where: { userId } })
          )?.id ||
          userId,
        previousStatus: ride.status,
        newStatus: 'REPORTED',
        notes: JSON.stringify({
          issue: body.issue,
          description: body.description,
          by: body.reportedBy,
        }),
      },
    });
    return { success: true, data: { id: record.id } };
  }

  async sendRideMessage(
    rideId: string,
    userId: string,
    body: { message: string; to: 'driver' | 'passenger' },
  ) {
    const ride = await this.prisma.ride.findFirst({
      where: {
        id: rideId,
        OR: [{ Passenger: { userId } }, { Driver: { userId } }],
      },
      include: {
        Passenger: { include: { User: true } },
        Driver: { include: { User: true } },
      },
    });
    if (!ride) throw new NotFoundException('Corrida não encontrada');

    await this.prisma.rideStatusHistory.create({
      data: {
        rideId,
        driverId:
          ride.driverId ||
          (
            await this.prisma.driver.findFirst({ where: { userId } })
          )?.id ||
          userId,
        previousStatus: ride.status,
        newStatus: 'MESSAGE',
        notes: JSON.stringify({ message: body.message, to: body.to }),
      },
    });
    return { success: true };
  }

  // ==================== FINALIZAÇÃO DA CORRIDA ====================

  async completeRide(
    driverId: string,
    rideId: string,
    completionData: {
      actualDistance?: number;
      actualDuration?: number;
      finalLocation?: { latitude: number; longitude: number };
    },
  ): Promise<{
    success: boolean;
    data: any;
    message: string;
  }> {
    try {
      const ride = await this.prisma.ride.findFirst({
        where: {
          id: rideId,
          driverId,
          status: RideStatus.IN_PROGRESS,
        },
        include: {
          Payment: true,
          Passenger: { include: { User: { include: { UserWallet: true } } } },
          Driver: { include: { User: { include: { UserWallet: true } } } },
        },
      });

      if (!ride) {
        throw new NotFoundException(
          'Corrida não encontrada ou não está em progresso',
        );
      }

      // Atualizar dados da corrida
      const updatedRide = await this.prisma.ride.update({
        where: { id: rideId },
        data: {
          status: RideStatus.COMPLETED,
          dropOffTime: new Date(),
          actualDistance: completionData.actualDistance,
          actualDuration: completionData.actualDuration,
        },
      });

      // NOVO: Automatic wallet balance transfer for WALLET_BALANCE payments
      if (
        ride.Payment &&
        ride.Payment.method === 'WALLET_BALANCE' &&
        ride.Payment.status !== 'PAID' &&
        ride.Driver &&
        ride.finalPrice
      ) {
        try {
          this.logger.log(
            `🚀 Automatically processing wallet payment for completed ride ${ride.id}`,
          );

          const paymentResult =
            await this.paymentsService.processRidePaymentByMethod(
              PaymentMethod.WALLET_BALANCE,
              ride.id,
              ride.Passenger.userId,
              ride.Driver.userId,
              ride.finalPrice,
              `Automatic payment for completed ride`,
            );

          if (paymentResult.success) {
            this.logger.log(
              `✅ Wallet payment processed successfully for ride ${ride.id}: R$ ${ride.finalPrice} (net: R$ ${paymentResult.data.netAmount}, fee: R$ ${paymentResult.data.platformFee})`,
            );
          } else {
            this.logger.error(
              `❌ Failed to process wallet payment for ride ${ride.id}: ${paymentResult.message}`,
            );
            // Don't fail the ride completion, just log the error
          }
        } catch (paymentError) {
          this.logger.error(
            `❌ Error processing automatic wallet payment for ride ${ride.id}:`,
            paymentError,
          );
          // Don't fail the ride completion, just log the error
        }
      } else if (
        ride.Payment &&
        ride.Payment.method === 'WALLET_BALANCE' &&
        (!ride.Driver || !ride.finalPrice)
      ) {
        this.logger.warn(
          `⚠️ Cannot process automatic wallet payment for ride ${
            ride.id
          }: missing driver (${!!ride.Driver}) or finalPrice (${!!ride.finalPrice})`,
        );
      }

      // Disponibilizar motorista novamente
      await this.prisma.driver.update({
        where: { id: driverId },
        data: {
          isAvailable: true,
          isActiveTrip: false,
        },
      });

      // PRODUÇÃO: Limpar cache de idempotência para permitir novas corridas
      try {
        await this.idempotency.deleteByPattern(
          `rides:create:${ride.Passenger.userId}:*`,
        );
        this.logger.log(
          `🧹 Cache de idempotência limpo para usuário ${ride.Passenger.userId}`,
        );
      } catch (error) {
        this.logger.warn(
          `⚠️ Falha ao limpar cache de idempotência: ${error.message}`,
        );
      }

      // Get updated payment status after automatic processing
      const updatedPayment = await this.prisma.payment.findUnique({
        where: { rideId: ride.id },
      });

      // NOVO: Preparar informações de pagamento
      const paymentInfo = {
        rideId: ride.id,
        amount: ride.finalPrice,
        currency: 'BRL',
        currentStatus: updatedPayment?.status || PaymentStatus.PENDING,
        requiresPayment:
          !updatedPayment || updatedPayment.status === PaymentStatus.PENDING,
        availableMethods: await this.paymentsService.getPaymentMethods(
          ride.Passenger.userId,
        ),
        automaticallyProcessed:
          updatedPayment?.method === 'WALLET_BALANCE' &&
          updatedPayment?.status === 'PAID',
      };

      return {
        success: true,
        data: {
          rideId: updatedRide.id,
          status: updatedRide.status,
          completedAt: updatedRide.dropOffTime,
          finalDistance: updatedRide.actualDistance,
          finalDuration: updatedRide.actualDuration,
          payment: paymentInfo,
        },
        message:
          updatedPayment?.method === 'WALLET_BALANCE' &&
          updatedPayment?.status === 'PAID'
            ? 'Ride completed and wallet payment processed automatically'
            : 'Corrida finalizada com sucesso',
      };
    } catch (error) {
      this.logger.error('Erro ao finalizar corrida:', error);

      // PRODUÇÃO: Garantir que motorista seja marcado como disponível mesmo em caso de erro
      try {
        await this.prisma.driver.update({
          where: { id: driverId },
          data: {
            isAvailable: true,
            isActiveTrip: false,
          },
        });
        this.logger.log(
          `✅ Motorista ${driverId} marcado como disponível após erro`,
        );
      } catch (driverError) {
        this.logger.error(
          `❌ Falha crítica ao disponibilizar motorista ${driverId}:`,
          driverError,
        );
      }

      return {
        success: false,
        data: null,
        message:
          error instanceof Error ? error.message : 'Erro ao finalizar corrida',
      };
    }
  }

  // ==================== CONSULTAS COM INFORMAÇÕES DE PAGAMENTO ====================

  async getUserRides(
    userId: string,
    filters: {
      status?: RideStatus;
      limit?: number;
      offset?: number;
      isDriver?: boolean;
    } = {},
  ): Promise<{
    success: boolean;
    data: any[];
    pagination: any;
    message: string;
  }> {
    try {
      const { status, limit = 20, offset = 0, isDriver = false } = filters;

      const whereClause: any = {};

      if (isDriver) {
        const driver = await this.prisma.driver.findUnique({
          where: { userId },
        });

        if (!driver) {
          throw new NotFoundException('Perfil de motorista não encontrado');
        }

        whereClause.driverId = driver.id;
      } else {
        const passenger = await this.prisma.passenger.findUnique({
          where: { userId },
        });

        if (!passenger) {
          throw new NotFoundException('Perfil de passageiro não encontrado');
        }

        whereClause.passengerId = passenger.id;
      }

      if (status) {
        whereClause.status = status;
      }

      const [rides, total] = await Promise.all([
        this.prisma.ride.findMany({
          where: whereClause,
          include: {
            Passenger: {
              include: { User: { include: { UserWallet: true } } },
            },
            Driver: {
              include: {
                User: { include: { UserWallet: true } },
                Vehicle: true,
              },
            },
            RideTypeConfig: true,
            Payment: true, // NOVO: Incluir dados de pagamento
            Rating: true,
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        this.prisma.ride.count({ where: whereClause }),
      ]);

      const formattedRides = rides.map((ride) =>
        this.formatRideResponseDetailed(ride),
      );

      return {
        success: true,
        data: formattedRides,
        pagination: {
          total,
          limit,
          offset,
          pages: Math.ceil(total / limit),
        },
        message: 'Corridas retornadas com sucesso',
      };
    } catch (error) {
      this.logger.error('Erro ao buscar corridas do usuário:', error);
      return {
        success: false,
        data: [],
        pagination: { total: 0, limit: 0, offset: 0, pages: 0 },
        message:
          error instanceof Error ? error.message : 'Erro ao buscar corridas',
      };
    }
  }

  // ==================== CANCELAMENTO INTEGRADO COM PAGAMENTOS ====================

  async cancelRide(
    userId: string,
    rideId: string,
    reason: string,
    isDriver = false,
  ): Promise<{
    success: boolean;
    data: any;
    message: string;
  }> {
    try {
      const ride = await this.prisma.ride.findUnique({
        where: { id: rideId },
        include: {
          Passenger: { include: { User: true } },
          Driver: { include: { User: true } },
          RideTypeConfig: true,
          Payment: true, // NOVO: Incluir dados de pagamento
        },
      });

      if (!ride) {
        throw new NotFoundException('Corrida não encontrada');
      }

      if (isDriver) {
        const driver = await this.prisma.driver.findUnique({
          where: { userId },
        });

        if (!driver || ride.driverId !== driver.id) {
          throw new BadRequestException('Você não pode cancelar esta corrida');
        }
      } else {
        const passenger = await this.prisma.passenger.findUnique({
          where: { userId },
        });

        if (!passenger || ride.passengerId !== passenger.id) {
          throw new BadRequestException('Você não pode cancelar esta corrida');
        }
      }

      if (!['REQUESTED', 'ACCEPTED'].includes(ride.status)) {
        throw new BadRequestException(
          'Corrida não pode ser cancelada neste status',
        );
      }

      let cancellationFee = 0;
      if (ride.status === 'ACCEPTED' && !isDriver) {
        const timeSinceAccepted = ride.acceptTime
          ? (new Date().getTime() - ride.acceptTime.getTime()) / 1000 / 60
          : 0;

        if (timeSinceAccepted > 5) {
          cancellationFee = Math.min(ride.basePrice * 0.3, 10);
        }
      }

      const updatedRide = await this.prisma.ride.update({
        where: { id: rideId },
        data: {
          status: RideStatus.CANCELLED,
          cancellationReason: reason,
          cancellationTime: new Date(),
          cancellationFee,
        },
        include: {
          Passenger: { include: { User: true } },
          Driver: { include: { User: true } },
          RideTypeConfig: true,
          Payment: true,
        },
      });

      if (ride.driverId) {
        await this.prisma.driver.update({
          where: { id: ride.driverId },
          data: {
            isAvailable: true,
            isActiveTrip: false,
          },
        });
      }

      // NOVO: Processar reembolsos se necessário via PaymentsService
      if (ride.Payment && ride.Payment.status === PaymentStatus.PAID) {
        // Se já foi pago, processar reembolso
        // A lógica de reembolso já está implementada no PaymentsService
      }

      if (cancellationFee > 0) {
        await this.processCancellationFee(updatedRide, cancellationFee);
      }

      try {
        await this.chatService.closeChatRoom(rideId);
        await this.chatGateway.closeChatRoom(rideId);
        this.logger.log(`💬 Chat fechado para corrida cancelada: ${rideId}`);
      } catch (chatError) {
        this.logger.warn(`⚠️ Falha ao fechar chat: ${rideId}`, chatError);
      }

      this.rideGateway.emitToRide(rideId, 'ride:cancelled', {
        rideId: updatedRide.id,
        status: RideStatus.CANCELLED,
        reason,
        cancelledBy: isDriver ? 'driver' : 'passenger',
        cancellationFee,
        timestamp: new Date(),
      });

      return {
        success: true,
        data: {
          rideId: updatedRide.id,
          status: updatedRide.status,
          cancellationFee,
          refund: cancellationFee === 0,
        },
        message: 'Corrida cancelada com sucesso',
      };
    } catch (error) {
      this.logger.error('Erro ao cancelar corrida:', error);
      return {
        success: false,
        data: null,
        message:
          error instanceof Error ? error.message : 'Erro ao cancelar corrida',
      };
    }
  }

  // ==================== UTILITÁRIOS ATUALIZADOS ====================

  private formatRideResponseDetailed(ride: any): any {
    return {
      id: ride.id,
      status: ride.status,
      rideType: {
        id: ride.rideTypeConfig?.id,
        name: ride.rideTypeConfig?.name,
        icon: ride.rideTypeConfig?.icon,
      },
      origin: {
        address: ride.originAddress,
        latitude: ride.originLatitude,
        longitude: ride.originLongitude,
      },
      destination: {
        address: ride.destinationAddress,
        latitude: ride.destinationLatitude,
        longitude: ride.destinationLongitude,
      },
      timing: {
        requested: ride.requestTime,
        accepted: ride.acceptTime,
        pickup: ride.pickupTime,
        dropOff: ride.dropOffTime,
        scheduled: ride.scheduledTime,
      },
      pricing: {
        basePrice: ride.basePrice,
        finalPrice: ride.finalPrice,
        currency: ride.currency,
        paymentStatus: ride.Payment?.status,
      },
      // NOVO: Informações detalhadas de pagamento
      payment: ride.Payment
        ? {
            method: ride.Payment.method,
            status: ride.Payment.status,
            confirmedByDriver: ride.Payment.confirmedByDriver,
            confirmationTime: ride.Payment.driverConfirmationTime,
            driverNotes: ride.Payment.driverNotes,
            requiresAction: this.getPaymentRequiredAction(ride),
          }
        : null,
      driver: ride.Driver
        ? {
            id: ride.Driver.id,
            name: `${ride.Driver.User.firstName} ${ride.Driver.User.lastName}`,
            rating: ride.Driver.averageRating,
            phone: ride.Driver.User.phone,
            profileImage: ride.Driver.User.profileImage,
            vehicle: ride.Driver.Vehicle
              ? {
                  model: ride.Driver.Vehicle.model,
                  color: ride.Driver.Vehicle.color,
                  licensePlate: ride.Driver.Vehicle.licensePlate,
                  imageUrl: ride.Driver.Vehicle.carImageUrl,
                }
              : null,
          }
        : null,
      Passenger: {
        id: ride.Passenger.id,
        name: `${ride.Passenger.User.firstName} ${ride.Passenger.User.lastName}`,
        phone: ride.Passenger.User.phone,
        profileImage: ride.Passenger.User.profileImage,
      },
      details: {
        distance: ride.estimatedDistance,
        duration: ride.estimatedDuration,
        actualDistance: ride.actualDistance,
        actualDuration: ride.actualDuration,
        hasPets: ride.hasPets,
        specialRequirements: ride.specialRequirements,
        baggageQuantity: ride.baggageQuantity,
      },
      cancellation:
        ride.status === 'CANCELLED'
          ? {
              reason: ride.cancellationReason,
              time: ride.cancellationTime,
              fee: ride.cancellationFee,
            }
          : null,
      rating:
        ride.Rating?.length > 0
          ? {
              score: ride.Rating[0].rating,
              review: ride.Rating[0].review,
            }
          : null,
      createdAt: ride.createdAt,
      updatedAt: ride.updatedAt,
    };
  }

  private getPaymentRequiredAction(ride: any): string | null {
    if (!ride.Payment) {
      return 'PAYMENT_REQUIRED';
    }

    switch (ride.Payment.status) {
      case PaymentStatus.PENDING:
        if (!ride.Payment.confirmedByDriver) {
          return 'AWAITING_DRIVER_CONFIRMATION';
        }
        break;
      case PaymentStatus.PAID:
        if (!ride.Payment.confirmedByDriver) {
          return 'AWAITING_DRIVER_CONFIRMATION';
        }
        break;
      case PaymentStatus.FAILED:
        return 'PAYMENT_FAILED';
    }

    return null;
  }

  private async notifyNearbyDrivers(ride: any): Promise<void> {
    try {
      const nearbyDrivers =
        await this.mapsService.findAvailableDriversForRideType(
          { latitude: ride.originLatitude, longitude: ride.originLongitude },
          ride.rideTypeConfigId,
          undefined,
          15,
          10,
        );

      this.logger.log(
        `Notificando ${nearbyDrivers.length} motoristas sobre nova corrida ${ride.id}`,
      );

      if (nearbyDrivers.length > 0) {
        // Preparar dados da corrida para os motoristas
        const rideRequestData = {
          id: ride.id,
          passengerId: ride.passengerId,
          passengerName: ride.Passenger?.User?.firstName || 'Passageiro',
          originAddress: ride.originAddress,
          destinationAddress: ride.destinationAddress,
          originLatitude: ride.originLatitude,
          originLongitude: ride.originLongitude,
          destinationLatitude: ride.destinationLatitude,
          destinationLongitude: ride.destinationLongitude,
          estimatedDistance: ride.estimatedDistance,
          estimatedDuration: ride.estimatedDuration,
          estimatedPrice: ride.finalPrice,
          rideTypeId: ride.rideTypeConfigId,
          rideTypeName: ride.RideTypeConfig?.name || 'Normal',
          specialRequirements: ride.specialRequirements,
          hasPets: ride.hasPets,
          petDescription: ride.petDescription,
          createdAt: ride.createdAt,
          expiresAt: new Date(Date.now() + 60000), // 1 minuto para aceitar
        };

        // Extrair IDs dos motoristas para notificar
        const driverUserIds = nearbyDrivers
          .map((driver) => driver.userId)
          .filter(Boolean);

        this.logger.log(
          `🚗 Motoristas próximos encontrados: ${nearbyDrivers.length}`,
        );
        this.logger.log(
          `👥 UserIDs para notificar: ${JSON.stringify(driverUserIds)}`,
        );

        // CORREÇÃO: Enviar via WebSocket com logs mais detalhados
        if (this.rideGateway) {
          if (driverUserIds.length > 0) {
            this.logger.log(`🚨 🚨 CALLING RIDE GATEWAY BROADCAST 🚨 🚨`);
            this.logger.log(
              `🎯 Ride: ${ride.id} | Drivers to notify: ${driverUserIds.length}`,
            );
            this.logger.log(
              `👥 Driver UserIDs: ${JSON.stringify(driverUserIds)}`,
            );

            this.rideGateway.broadcastRideRequest(
              rideRequestData,
              driverUserIds,
            );

            this.logger.log(
              `✅ ✅ RIDE BROADCAST INITIATED for ride ${ride.id} ✅ ✅`,
            );
          } else {
            this.logger.warn(
              `⚠️ NO DRIVER USER IDS to notify for ride ${ride.id}`,
            );
          }
        } else {
          this.logger.error(
            `❌ RideGateway NÃO ESTÁ DISPONÍVEL! Cannot broadcast ride ${ride.id}`,
          );
        }

        // Também enviar notificação push se disponível
        try {
          if (this.notificationsService) {
            await this.notificationsService.notifyMultipleDrivers(
              driverUserIds,
              'Nova corrida disponível!',
              `Corrida de ${rideRequestData.originAddress} para ${rideRequestData.destinationAddress}`,
              {
                type: 'NEW_RIDE_REQUEST',
                rideId: ride.id,
                data: rideRequestData,
              },
            );
          }
        } catch (notifError) {
          this.logger.warn(
            'Erro ao enviar notificação push:',
            notifError?.message || 'Erro desconhecido',
          );
        }
      } else {
        this.logger.warn(
          `⚠️ Nenhum motorista disponível para corrida ${ride.id}`,
        );
      }
    } catch (error) {
      this.logger.error('Erro ao notificar motoristas:', error);
    }
  }

  private isPremiumTime(): boolean {
    const hour = new Date().getHours();
    return (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19);
  }

  /**
   * Validates price consistency and returns the canonical price from RideTypesService
   * This method ensures all pricing calculations use the single source of truth
   */
  async validateAndGetCanonicalPrice(
    rideTypeId: string,
    distance: number,
    duration: number,
    surgeMultiplier: number = 1.0,
    providedPrice?: number,
  ): Promise<{
    canonicalPrice: number;
    basePrice: number;
    finalPrice: number;
    currency: string;
    breakdown: any;
    isPriceConsistent: boolean;
    priceDifference?: number;
  }> {
    // Always calculate using the canonical RideTypesService
    const priceCalculation = await this.rideTypesService.calculateRidePrice({
      rideTypeId,
      distance,
      duration,
      surgeMultiplier,
      isPremiumTime: this.isPremiumTime(),
    });

    let isPriceConsistent = true;
    let priceDifference = 0;

    // Validate against provided price if available
    if (providedPrice && providedPrice > 0) {
      priceDifference = Math.abs(providedPrice - priceCalculation.finalPrice);
      const tolerancePercent = 0.05; // 5% tolerance
      const maxAllowedDifference =
        priceCalculation.finalPrice * tolerancePercent;

      isPriceConsistent = priceDifference <= maxAllowedDifference;

      if (!isPriceConsistent) {
        this.logger.warn(
          `Price inconsistency detected for rideType ${rideTypeId}: ` +
            `provided=${providedPrice}, canonical=${priceCalculation.finalPrice}, ` +
            `difference=${priceDifference} (${(
              (priceDifference / priceCalculation.finalPrice) *
              100
            ).toFixed(2)}%)`,
        );
      }
    }

    return {
      canonicalPrice: priceCalculation.finalPrice,
      basePrice: priceCalculation.basePrice,
      finalPrice: priceCalculation.finalPrice,
      currency: priceCalculation.currency,
      breakdown: priceCalculation.breakdown,
      isPriceConsistent,
      priceDifference,
    };
  }

  private async processCancellationFee(ride: any, fee: number): Promise<void> {
    try {
      await this.prisma.payment.upsert({
        where: { rideId: ride.id },
        create: {
          rideId: ride.id,
          amount: fee,
          status: PaymentStatus.PENDING,
          method: PaymentMethod.CASH,
        },
        update: {
          amount: fee,
          status: PaymentStatus.PENDING,
        },
      });

      this.logger.log(
        `Taxa de cancelamento de R$ ${fee} aplicada à corrida ${ride.id}`,
      );
    } catch (error) {
      this.logger.error('Erro ao processar taxa de cancelamento:', error);
    }
  }

  private cleanExpiredTokens(): void {
    const now = new Date();
    for (const [token, data] of this.confirmationTokens.entries()) {
      if (now > data.expires) {
        this.confirmationTokens.delete(token);
      }
    }
  }

  // ==================== NOVAS FUNCIONALIDADES OBRIGATÓRIAS ====================

  async getPendingRidesForDriver(driverId: string, limit = 10) {
    try {
      const driver = await this.prisma.driver.findUnique({
        where: { id: driverId },
      });

      if (!driver) {
        throw new NotFoundException(
          `Motorista com ID ${driverId} não encontrado`,
        );
      }

      // Buscar corridas reais pendentes (status REQUESTED) da tabela Ride
      const pendingRides = await this.prisma.ride.findMany({
        where: {
          status: RideStatus.REQUESTED, // Corridas que ainda não foram aceitas
          driverId: null, // Ainda não foram atribuídas a um motorista
        },
        include: {
          Passenger: {
            include: {
              User: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  profileImage: true,
                  phone: true,
                },
              },
            },
          },
          RideTypeConfig: true,
        },
        orderBy: { requestTime: 'desc' },
        take: limit,
      });

      this.logger.log(
        `Encontradas ${pendingRides.length} corridas pendentes para motorista ${driverId}`,
      );

      return {
        success: true,
        data: pendingRides.map((ride) => this.formatRideResponse(ride)),
      };
    } catch (error) {
      this.logger.error(
        `Error getting pending rides for driver ${driverId}:`,
        error,
      );
      return {
        success: false,
        data: [],
        message:
          error instanceof Error
            ? error.message
            : 'Erro ao buscar corridas pendentes',
      };
    }
  }

  async acceptRide(
    driverId: string,
    rideId: string,
    acceptData: AcceptRideDto,
  ) {
    try {
      const ride = await this.prisma.ride.findUnique({
        where: { id: rideId },
        include: {
          Passenger: { include: { User: true } },
          Driver: { include: { User: true } },
        },
      });

      if (!ride) {
        throw new NotFoundException('Corrida não encontrada');
      }

      if (ride.status !== 'REQUESTED') {
        throw new BadRequestException(
          'Corrida não está mais disponível para aceitação',
        );
      }

      if (ride.driverId && ride.driverId !== driverId) {
        throw new BadRequestException(
          'Esta corrida já foi aceita por outro motorista',
        );
      }

      const driver = await this.prisma.driver.findUnique({
        where: {
          id: driverId,
          isOnline: true,
          isAvailable: true,
          accountStatus: 'APPROVED',
        },
        include: { User: true, Vehicle: true },
      });

      if (!driver) {
        throw new BadRequestException('Motorista não está disponível');
      }

      const updatedRide = await this.prisma.ride.update({
        where: { id: rideId },
        data: {
          driverId,
          vehicleId: driver.Vehicle?.id,
          status: RideStatus.ACCEPTED,
          acceptTime: new Date(),
        },
        include: {
          Passenger: { include: { User: true } },
          Driver: { include: { User: true, Vehicle: true } },
        },
      });

      await this.prisma.driver.update({
        where: { id: driverId },
        data: {
          isAvailable: false,
          isActiveTrip: true,
        },
      });

      await this.createRideStatusHistory(
        rideId,
        driverId,
        'REQUESTED',
        'ACCEPTED',
        {
          latitude: acceptData.currentLocation.latitude,
          longitude: acceptData.currentLocation.longitude,
        },
      );

      this.logger.log(`Ride ${rideId} accepted by driver ${driverId}`);

      // 💬 AUTO-CRIAR CHAT para a corrida aceita
      try {
        // Criar chat para o passageiro (usando userId do passageiro)
        const passengerUserId = updatedRide.Passenger.User.id;
        await this.chatService.getOrCreateChatByRideId(rideId, passengerUserId);

        // Notificar via WebSocket que o chat foi ativado
        if (this.rideGateway) {
          this.rideGateway.emitChatActivated(rideId);
        }

        this.logger.log(`💬 Chat created/activated for ride ${rideId}`);
      } catch (chatError) {
        this.logger.warn(
          `Warning: Failed to create chat for ride ${rideId}:`,
          chatError,
        );
        // Não falhar a operação se a criação do chat falhar
      }

      // Notificar o passageiro via WebSocket
      try {
        // Usar o gateway de rides para emitir a notificação
        if (this.rideGateway) {
          this.rideGateway.emitRideAccepted(
            rideId,
            {
              driverId: updatedRide.Driver?.id,
              driverName: `${updatedRide.Driver?.User?.firstName || ''} ${
                updatedRide.Driver?.User?.lastName || ''
              }`,
              driverRating: updatedRide.Driver?.averageRating,
              vehicle: updatedRide.Driver?.Vehicle,
              estimatedArrival: acceptData.estimatedPickupTime,
              // CORREÇÃO: Incluir localização atual do driver
              currentLatitude: acceptData.currentLocation.latitude,
              currentLongitude: acceptData.currentLocation.longitude,
            },
            acceptData.estimatedPickupTime,
            updatedRide.finalPrice || 0,
          ); // CORREÇÃO: Incluir preço da corrida
          this.logger.log(
            `✅ WebSocket notification sent to passenger for ride ${rideId} with price ${updatedRide.finalPrice}`,
          );
        }

        // Também usar o serviço de notificações
        if (this.notificationsService) {
          await this.notificationsService.notifyRideAccepted(
            updatedRide.passengerId,
            rideId,
            {
              driverId: updatedRide.Driver?.id,
              driverName: `${updatedRide.Driver?.User?.firstName || ''} ${
                updatedRide.Driver?.User?.lastName || ''
              }`,
              driverRating: updatedRide.Driver?.averageRating,
              vehicle: updatedRide.Driver?.Vehicle,
              estimatedArrival: acceptData.estimatedPickupTime,
            },
          );
        }
      } catch (notificationError) {
        this.logger.warn(
          `Warning: Failed to send notification for accepted ride ${rideId}:`,
          notificationError,
        );
        // Não falhar a operação se a notificação falhar
      }

      return {
        success: true,
        data: {
          rideId: updatedRide.id,
          status: 'accepted',
          acceptedAt: updatedRide.acceptTime,
          estimatedPickupTime: acceptData.estimatedPickupTime,
        },
      };
    } catch (error) {
      this.logger.error(`Error accepting ride ${rideId}:`, error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : 'Erro ao aceitar corrida',
      };
    }
  }

  async rejectRide(
    driverId: string,
    rideId: string,
    rejectData: RejectRideDto,
  ) {
    try {
      const ride = await this.prisma.ride.findUnique({
        where: { id: rideId },
      });

      if (!ride) {
        throw new NotFoundException('Corrida não encontrada');
      }

      this.logger.log(
        `Ride ${rideId} rejected by driver ${driverId}: ${rejectData.reason}`,
      );

      return {
        success: true,
        message: 'Corrida rejeitada com sucesso',
      };
    } catch (error) {
      this.logger.error(`Error rejecting ride ${rideId}:`, error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : 'Erro ao rejeitar corrida',
      };
    }
  }

  async markDriverArrived(
    driverId: string,
    rideId: string,
    arrivedData: ArrivedDto,
  ) {
    try {
      const ride = await this.prisma.ride.findFirst({
        where: {
          id: rideId,
          driverId,
          status: RideStatus.ACCEPTED,
        },
      });

      if (!ride) {
        throw new NotFoundException(
          'Corrida não encontrada ou não está no status correto',
        );
      }

      // CORREÇÃO: Manter status ACCEPTED e notificar apenas via WebSocket
      // Não alterar status no banco para evitar problemas de compatibilidade
      console.log(
        `🚗 Driver ${driverId} arrived at pickup location for ride ${rideId}`,
      );

      await this.createRideStatusHistory(
        rideId,
        driverId,
        'ACCEPTED',
        'DRIVER_ARRIVED_EVENT', // Usar evento personalizado em vez de status
        {
          latitude: arrivedData.currentLocation.latitude,
          longitude: arrivedData.currentLocation.longitude,
        },
      );

      // CORREÇÃO: Notificar passageiro via WebSocket com eventos específicos
      this.logger.log(
        `🔍 Debug RideGateway availability: ${!!this.rideGateway}`,
      );
      if (this.rideGateway) {
        this.logger.log(
          `📡 About to emit driver arrived events for ride ${rideId}`,
        );

        // Emitir evento genérico de mudança de status
        this.rideGateway.emitStatusUpdate(rideId, 'driver_arrived', {
          latitude: arrivedData.currentLocation.latitude,
          longitude: arrivedData.currentLocation.longitude,
        });

        // Emitir evento específico de chegada do motorista
        this.rideGateway.emitDriverArrived(rideId, {
          latitude: arrivedData.currentLocation.latitude,
          longitude: arrivedData.currentLocation.longitude,
        });

        // CORREÇÃO: Emitir também eventos adicionais para máxima compatibilidade
        this.rideGateway.emitToRide(rideId, 'ride:status-changed', {
          rideId,
          status: 'driver_arrived',
          location: {
            latitude: arrivedData.currentLocation.latitude,
            longitude: arrivedData.currentLocation.longitude,
          },
          timestamp: new Date().toISOString(),
        });

        this.logger.log(
          `✅ WebSocket notifications sent: driver arrived for ride ${rideId}`,
        );
      } else {
        this.logger.error(`❌ RideGateway not available for ride ${rideId}!`);
      }

      this.logger.log(
        `Driver ${driverId} arrived at pickup location for ride ${rideId}`,
      );

      return {
        success: true,
        data: {
          status: 'driver_arrived',
          arrivedAt: arrivedData.arrivedAt,
          waitingStartedAt: new Date(),
        },
      };
    } catch (error) {
      this.logger.error(
        `Error marking driver arrived for ride ${rideId}:`,
        error,
      );
      return {
        success: false,
        message:
          error instanceof Error ? error.message : 'Erro ao marcar chegada',
      };
    }
  }

  async startRide(driverId: string, rideId: string, startData: StartRideDto) {
    try {
      const ride = await this.prisma.ride.findFirst({
        where: {
          id: rideId,
          driverId,
          status: RideStatus.ACCEPTED, // CORREÇÃO: Usar apenas status válido do Prisma
        },
      });

      if (!ride) {
        throw new NotFoundException(
          'Corrida não encontrada ou não está no status correto',
        );
      }

      const updatedRide = await this.prisma.ride.update({
        where: { id: rideId },
        data: {
          status: RideStatus.IN_PROGRESS,
          pickupTime: new Date(startData.startedAt), // CORREÇÃO: Converter string ISO 8601 para Date
        },
      });

      await this.createRideStatusHistory(
        rideId,
        driverId,
        ride.status, // CORREÇÃO: Usar status atual da corrida (ACCEPTED ou DRIVER_ARRIVED)
        'IN_PROGRESS',
        {
          latitude: startData.currentLocation.latitude,
          longitude: startData.currentLocation.longitude,
        },
      );

      // CORREÇÃO: Notify passenger via WebSocket com eventos específicos
      if (this.rideGateway) {
        // Emitir evento genérico de mudança de status
        this.rideGateway.emitStatusUpdate(rideId, 'in_progress', {
          latitude: startData.currentLocation.latitude,
          longitude: startData.currentLocation.longitude,
        });

        // Emitir evento específico de início de viagem
        this.rideGateway.emitRideStarted(rideId, startData.route);

        // CORREÇÃO: Emitir também eventos adicionais para máxima compatibilidade
        this.rideGateway.emitToRide(rideId, 'ride:status-changed', {
          rideId,
          status: 'in_progress',
          location: {
            latitude: startData.currentLocation.latitude,
            longitude: startData.currentLocation.longitude,
          },
          timestamp: new Date().toISOString(),
        });

        this.logger.log(
          `✅ WebSocket notifications sent: ride started for ${rideId}`,
        );
      }

      this.logger.log(`Ride ${rideId} started by driver ${driverId}`);

      return {
        success: true,
        data: {
          status: 'in_progress',
          startedAt: startData.startedAt,
          route: startData.route,
        },
      };
    } catch (error) {
      this.logger.error(`Error starting ride ${rideId}:`, error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : 'Erro ao iniciar corrida',
      };
    }
  }

  async completeRideNew(
    driverId: string,
    rideId: string,
    completeData: CompleteRideDto,
  ) {
    try {
      // 🔥 CRITICAL PERFORMANCE FIX: Ultra-light atomic ride completion (fastest possible)
      const ride = await this.prisma.ride.update({
        where: {
          id: rideId,
          driverId,
          status: RideStatus.IN_PROGRESS, // This acts as the lock condition
        },
        data: {
          status: RideStatus.COMPLETED,
          dropOffTime: completeData.completedAt,
          actualDistance: completeData.actualDistance,
          actualDuration: completeData.actualDuration,
        },
        include: {
          Passenger: { select: { id: true, User: { select: { id: true } } } },
          Driver: { select: { id: true, User: { select: { id: true } } } },
          Payment: true,
        },
      });

      const driverEarnings = (ride.finalPrice || 0) * 0.9;

      // 🔥 Non-blocking async updates (fire and forget for non-critical operations)
      const statsUpdatePromises = [
        // Update driver stats
        this.prisma.driver
          .update({
            where: { id: driverId },
            data: {
              isAvailable: true,
              isActiveTrip: false,
              totalRides: { increment: 1 },
            },
          })
          .catch((error) =>
            this.logger.warn(`Error updating driver stats:`, error),
          ),

        // Update passenger stats
        this.prisma.passenger
          .update({
            where: { id: ride.passengerId },
            data: {
              totalRides: { increment: 1 },
            },
          })
          .catch((error) =>
            this.logger.warn(`Error updating passenger stats:`, error),
          ),

        // Create status history
        this.createRideStatusHistory(
          rideId,
          driverId,
          'IN_PROGRESS',
          'COMPLETED',
          {
            latitude: completeData.finalLocation.latitude,
            longitude: completeData.finalLocation.longitude,
          },
        ).catch((error) =>
          this.logger.warn(`Error creating ride history:`, error),
        ),
      ];

      // 🔥 Process payment synchronously (critical for completion)
      let paymentResult: {
        success: boolean;
        data: any;
        message: string;
      } | null = null;

      if (ride.Payment?.method) {
        this.logger.log(
          `💰 Processing ${ride.Payment.method} payment for ride ${rideId}: R$ ${ride.finalPrice}`,
        );

        try {
          // Process payment outside the main transaction to prevent timeout
          paymentResult = await this.paymentsService.processRidePaymentByMethod(
            ride.Payment.method,
            rideId,
            ride.Passenger.User.id, // passengerId
            (ride.Driver?.User.id || ride.driverId) as string, // driverId
            ride.finalPrice || 0,
            `Corrida ${rideId.substring(0, 8)}`,
          );

          if (!paymentResult.success) {
            this.logger.error(
              `❌ Payment failed for ride ${rideId}: ${paymentResult.message}`,
            );

            // ROLLBACK: Revert ride status if payment fails
            await this.prisma.ride.update({
              where: { id: rideId },
              data: { status: RideStatus.IN_PROGRESS },
            });

            // Cancel stats updates promises since payment failed
            this.logger.warn(
              `⚠️ Payment failed - stats updates will complete in background but ride reverted`,
            );

            throw new BadRequestException(
              `Falha no pagamento: ${paymentResult.message}`,
            );
          }

          // STEP 3: Update payment status in separate transaction
          await this.prisma.payment.update({
            where: { id: ride.Payment.id },
            data: {
              status: PaymentStatus.PAID,
              confirmedByDriver: true,
              driverConfirmationTime: new Date(),
              driverNotes: `Automatic payment processing - ${ride.Payment.method}`,
            },
          });

          this.logger.log(
            `✅ ${ride.Payment.method} payment processed successfully: R$ ${ride.finalPrice} for ride ${rideId}`,
          );
        } catch (paymentError) {
          this.logger.error(
            `💥 Critical payment error for ride ${rideId}:`,
            paymentError,
          );

          // ROLLBACK: Revert ride status if payment fails completely
          await this.prisma.ride.update({
            where: { id: rideId },
            data: { status: RideStatus.IN_PROGRESS },
          });

          this.logger.warn(
            `⚠️ Critical payment error - stats updates will complete in background but ride reverted`,
          );

          throw new BadRequestException(
            `Falha crítica no pagamento: ${
              paymentError instanceof Error
                ? paymentError.message
                : 'Erro desconhecido'
            }`,
          );
        }
      }

      // 🔥 Non-blocking WebSocket notifications (fire and forget)
      if (this.rideGateway) {
        setImmediate(() => {
          try {
            this.rideGateway.emitStatusUpdate(rideId, 'completed', {
              latitude: completeData.finalLocation.latitude,
              longitude: completeData.finalLocation.longitude,
            });

            this.rideGateway.emitRideCompleted(rideId, {
              distance: completeData.actualDistance,
              duration: completeData.actualDuration,
              finalLocation: completeData.finalLocation,
              finalPrice: ride.finalPrice,
              earnings: driverEarnings,
              paymentProcessed: paymentResult?.success || false,
            });

            this.logger.log(
              `✅ WebSocket notifications sent: ride completed for ${rideId}`,
            );
          } catch (error) {
            this.logger.warn(`Error sending WebSocket notifications:`, error);
          }
        });
      }

      // 💬 FECHAR CHAT após corrida completada (non-blocking)
      setImmediate(async () => {
        try {
          await this.chatService.closeChatRoom(rideId);
          await this.chatGateway.closeChatRoom(rideId);
          this.logger.log(`💬 Chat fechado para corrida completada ${rideId}`);
        } catch (chatError) {
          this.logger.warn(
            `⚠️ Falha ao fechar chat da corrida ${rideId}:`,
            chatError,
          );
        }
      });

      // Wait for all non-critical operations to complete (but don't block the response)
      Promise.all(statsUpdatePromises)
        .then(() => {
          this.logger.log(`✅ All stats updated for ride ${rideId}`);
        })
        .catch((error) => {
          this.logger.warn(
            `Some stats updates failed for ride ${rideId}:`,
            error,
          );
        });

      this.logger.log(
        `🏁 Ride ${rideId} completed ULTRA-FAST by driver ${driverId}. Earnings: ${driverEarnings}, Payment: ${
          paymentResult?.success ? 'SUCCESS' : 'N/A'
        }`,
      );

      return {
        success: true,
        data: {
          status: 'completed',
          rideId,
          finalPrice: ride.finalPrice,
          earnings: driverEarnings,
          paymentProcessed: paymentResult?.success || false,
          completedAt: completeData.completedAt,
        },
        message: 'Corrida finalizada com sucesso',
      };
    } catch (error) {
      this.logger.error(`Error completing ride ${rideId}:`, error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : 'Erro ao finalizar corrida',
      };
    }
  }

  async cancelRideNew(
    driverId: string,
    rideId: string,
    cancelData: CancelRideDto,
  ) {
    try {
      const ride = await this.prisma.ride.findUnique({
        where: { id: rideId },
        include: {
          Passenger: { include: { User: true } },
          Driver: { include: { User: true } },
          Payment: true,
        },
      });

      if (!ride) {
        throw new NotFoundException('Corrida não encontrada');
      }

      if (cancelData.isDriver && ride.driverId !== driverId) {
        throw new BadRequestException('Você não pode cancelar esta corrida');
      }

      if (!['REQUESTED', 'ACCEPTED', 'IN_PROGRESS'].includes(ride.status)) {
        throw new BadRequestException(
          'Corrida não pode ser cancelada neste status',
        );
      }

      let cancellationFee = 0;
      let refundAmount = 0;

      if (ride.status === 'ACCEPTED' && !cancelData.isDriver) {
        cancellationFee = Math.min((ride.finalPrice || 0) * 0.3, 10);
      } else if (ride.status === 'IN_PROGRESS') {
        cancellationFee = Math.min((ride.finalPrice || 0) * 0.5, 20);
      } else if (ride.Payment?.status === PaymentStatus.PAID) {
        refundAmount = (ride.finalPrice || 0) - cancellationFee;
      }

      const updatedRide = await this.prisma.ride.update({
        where: { id: rideId },
        data: {
          status: RideStatus.CANCELLED,
          cancellationReason: cancelData.reason,
          cancellationTime: cancelData.cancelledAt,
          cancellationFee,
        },
      });

      if (ride.driverId) {
        await this.prisma.driver.update({
          where: { id: ride.driverId },
          data: {
            isAvailable: true,
            isActiveTrip: false,
          },
        });
      }

      await this.createRideStatusHistory(
        rideId,
        driverId,
        ride.status,
        'CANCELLED',
      );

      this.logger.log(
        `Ride ${rideId} cancelled. Reason: ${cancelData.reason}. Fee: ${cancellationFee}`,
      );

      // 💬 FECHAR CHAT após corrida cancelada (non-blocking)
      setImmediate(async () => {
        try {
          await this.chatService.closeChatRoom(rideId);
          await this.chatGateway.closeChatRoom(rideId);
          this.logger.log(`💬 Chat fechado para corrida cancelada ${rideId}`);
        } catch (chatError) {
          this.logger.warn(
            `⚠️ Falha ao fechar chat da corrida ${rideId}:`,
            chatError,
          );
        }
      });

      return {
        success: true,
        data: {
          status: 'cancelled',
          cancelledAt: cancelData.cancelledAt,
          cancellationFee,
          refundAmount,
        },
      };
    } catch (error) {
      this.logger.error(`Error cancelling ride ${rideId}:`, error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : 'Erro ao cancelar corrida',
      };
    }
  }

  async getDriverRides(
    driverId: string,
    limit = 20,
    offset = 0,
    status?: string,
  ) {
    try {
      const driver = await this.prisma.driver.findUnique({
        where: { id: driverId },
      });

      if (!driver) {
        throw new NotFoundException(
          `Motorista com ID ${driverId} não encontrado`,
        );
      }

      const whereClause: any = { driverId };
      if (status) {
        whereClause.status = status;
      }

      const [rides, total] = await Promise.all([
        this.prisma.ride.findMany({
          where: whereClause,
          include: {
            Passenger: { include: { User: true } },
            Driver: { include: { User: true, Vehicle: true } },
            RideTypeConfig: true,
            Payment: true,
            Rating: true,
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        this.prisma.ride.count({ where: whereClause }),
      ]);

      const completedRides = rides.filter(
        (ride) => ride.status === 'COMPLETED',
      );
      const totalEarnings = completedRides.reduce(
        (sum, ride) => sum + (ride.finalPrice || 0) * 0.8,
        0,
      );

      return {
        success: true,
        data: {
          rides: rides.map((ride) => this.formatRideResponseDetailed(ride)),
          summary: {
            total: total,
            completed: completedRides.length,
            totalEarnings,
            averageRating: driver.averageRating,
          },
          pagination: {
            total,
            limit,
            offset,
            pages: Math.ceil(total / limit),
          },
        },
      };
    } catch (error) {
      this.logger.error(`Error getting driver rides:`, error);
      return {
        success: false,
        data: { rides: [], summary: {}, pagination: {} },
        message:
          error instanceof Error ? error.message : 'Erro ao buscar corridas',
      };
    }
  }

  private async createRideStatusHistory(
    rideId: string,
    driverId: string,
    previousStatus: string,
    newStatus: string,
    location?: { latitude: number; longitude: number },
    notes?: string,
  ) {
    try {
      await this.prisma.rideStatusHistory.create({
        data: {
          rideId,
          driverId,
          previousStatus,
          newStatus,
          locationLatitude: location?.latitude,
          locationLongitude: location?.longitude,
          notes,
        },
      });
    } catch (error) {
      this.logger.error(`Error creating ride status history:`, error);
    }
  }

  private formatRideRequestResponse(request: any) {
    return {
      id: request.id,
      passengerId: request.passengerId,
      passengerName: `${request.Passenger.User.firstName} ${request.Passenger.User.lastName}`,
      passengerRating: request.Passenger.averageRating,
      pickupAddress: request.pickupAddress,
      pickupLocation: {
        latitude: Number(request.pickupLatitude),
        longitude: Number(request.pickupLongitude),
      },
      destinationAddress: request.destinationAddress,
      destinationLocation: {
        latitude: Number(request.destinationLatitude),
        longitude: Number(request.destinationLongitude),
      },
      rideType: {
        name: request.rideType.name,
        icon: request.rideType.icon,
      },
      estimatedPrice: Number(request.estimatedPrice),
      estimatedDistance: request.estimatedDistance,
      estimatedDuration: request.estimatedDuration,
      requestedAt: request.requestedAt,
      expiresAt: request.expiresAt,
    };
  }

  private formatRideResponse(ride: any) {
    return {
      id: ride.id,
      passengerId: ride.passengerId,
      passengerName: `${ride.Passenger.User.firstName} ${ride.Passenger.User.lastName}`,
      passengerRating: ride.Passenger.averageRating || 5.0,
      passengerPhone: ride.Passenger.User.phone,
      passengerProfileImage: ride.Passenger.User.profileImage,
      pickupAddress: ride.originAddress,
      pickupLocation: {
        latitude: ride.originLatitude,
        longitude: ride.originLongitude,
      },
      destinationAddress: ride.destinationAddress,
      destinationLocation: {
        latitude: ride.destinationLatitude,
        longitude: ride.destinationLongitude,
      },
      rideType: {
        name: ride.RideTypeConfig?.name || 'Normal',
        icon: ride.RideTypeConfig?.icon || '🚗',
      },
      estimatedPrice: ride.finalPrice || ride.basePrice,
      estimatedDistance: ride.estimatedDistance,
      estimatedDuration: ride.estimatedDuration,
      requestedAt: ride.requestTime,
      status: ride.status,
      currency: ride.currency,
      isFemaleOnlyRide: ride.isFemaleOnlyRide,
      hasPets: ride.hasPets,
      petDescription: ride.petDescription,
      specialRequirements: ride.specialRequirements,
      baggageQuantity: ride.baggageQuantity,
      scheduledTime: ride.scheduledTime,
    };
  }

  // ==================== BUSCA DE OPÇÕES DE CORRIDA ====================

  async searchAvailableRideOptions(
    userId: string,
    searchDto: {
      origin: { latitude: number; longitude: number; address: string };
      destination: { latitude: number; longitude: number; address: string };
      userGender?: 'M' | 'F';
      passengerId: string;
      preferences?: {
        maxPrice?: number;
        maxWaitTime?: number;
        rideTypeIds?: string[];
        hasPets?: boolean;
      };
    },
  ) {
    try {
      this.logger.log(`🔍 Buscando opções de corrida para usuário ${userId}`);

      // Validar dados de entrada
      if (!searchDto.origin || !searchDto.destination) {
        throw new BadRequestException('Origem e destino são obrigatórios');
      }

      if (
        !searchDto.origin.latitude ||
        !searchDto.origin.longitude ||
        !searchDto.destination.latitude ||
        !searchDto.destination.longitude
      ) {
        throw new BadRequestException(
          'Coordenadas de origem e destino são obrigatórias',
        );
      }

      // Buscar todos os tipos de corrida disponíveis
      const allRideTypes = await this.rideTypesService.findAllRideTypes();

      if (!allRideTypes || allRideTypes.length === 0) {
        this.logger.warn('Nenhum tipo de corrida encontrado no sistema');
        return {
          success: false,
          data: [],
          metadata: {
            totalOptions: 0,
            searchRadius: 5000, // 5km padrão
            timestamp: new Date().toISOString(),
            message: 'Nenhum tipo de corrida disponível no momento',
          },
        };
      }

      // Filtrar por tipos específicos se fornecidos
      let rideTypes = allRideTypes;
      if (
        searchDto.preferences?.rideTypeIds &&
        searchDto.preferences.rideTypeIds.length > 0
      ) {
        rideTypes = allRideTypes.filter((rt) =>
          searchDto.preferences!.rideTypeIds!.includes(rt.id),
        );
      }

      // Filtrar corridas somente femininas se usuário for masculino
      if (searchDto.userGender === 'M') {
        rideTypes = rideTypes.filter((rt) => !rt.isFemaleOnly);
      }

      // Buscar motoristas online em um raio de 5km
      const searchRadius = 5000; // 5km em metros
      const availableDrivers = await this.findAvailableDriversInRadius(
        searchDto.origin.latitude,
        searchDto.origin.longitude,
        searchRadius,
      );

      if (availableDrivers.length === 0) {
        this.logger.warn('Nenhum motorista disponível encontrado na região');
        return {
          success: false,
          data: [],
          metadata: {
            totalOptions: 0,
            searchRadius,
            timestamp: new Date().toISOString(),
            message: 'Nenhum motorista disponível na região no momento',
          },
        };
      }

      // Calcular distância e duração estimada da viagem
      let routeInfo;
      try {
        routeInfo = await this.mapsService.calculateRoute({
          origin: {
            latitude: searchDto.origin.latitude,
            longitude: searchDto.origin.longitude,
          },
          destination: {
            latitude: searchDto.destination.latitude,
            longitude: searchDto.destination.longitude,
          },
        });
      } catch (error) {
        this.logger.warn(
          `Erro ao calcular rota com Maps API: ${error.message}`,
        );
        routeInfo = null;
      }

      const estimatedDistance =
        routeInfo?.distance ||
        this.calculateSimpleDistance(
          searchDto.origin.latitude,
          searchDto.origin.longitude,
          searchDto.destination.latitude,
          searchDto.destination.longitude,
        );

      const estimatedDuration =
        routeInfo?.duration || Math.ceil((estimatedDistance / 500) * 60); // Aproximação: 30km/h

      // Criar opções para cada tipo de corrida que tem motoristas compatíveis
      const availableOptions: any[] = [];

      for (const rideType of rideTypes) {
        // Filtrar motoristas compatíveis com o tipo de corrida
        const compatibleDrivers = availableDrivers.filter((driver) => {
          // Verificar se motorista suporta este tipo de corrida
          if (
            rideType.vehicleTypeRequired &&
            driver.vehicleType !== rideType.vehicleTypeRequired
          ) {
            return false;
          }

          // Verificar corridas femininas
          if (rideType.isFemaleOnly && driver.user?.gender !== 'F') {
            return false;
          }

          // Verificar se aceita pets se necessário
          if (searchDto.preferences?.hasPets && !driver.acceptsPets) {
            return false;
          }

          return true;
        });

        // Se não há motoristas compatíveis, pular este tipo
        if (compatibleDrivers.length === 0) {
          continue;
        }

        // Calcular preço estimado usando RideTypesService para consistência
        const priceCalculation = await this.rideTypesService.calculateRidePrice(
          {
            rideTypeId: rideType.id,
            distance: estimatedDistance * 1000, // converter para metros
            duration: estimatedDuration * 60, // converter para segundos
            surgeMultiplier: 1.0,
            isPremiumTime: false,
          },
        );
        const estimatedPrice = priceCalculation.finalPrice;

        // Filtrar por preço máximo se especificado
        if (
          searchDto.preferences?.maxPrice &&
          estimatedPrice > searchDto.preferences.maxPrice
        ) {
          continue;
        }

        // Ordenar motoristas por proximidade (mais próximo primeiro)
        compatibleDrivers.sort((a, b) => {
          const distA = this.calculateSimpleDistance(
            searchDto.origin.latitude,
            searchDto.origin.longitude,
            a.currentLatitude,
            a.currentLongitude,
          );
          const distB = this.calculateSimpleDistance(
            searchDto.origin.latitude,
            searchDto.origin.longitude,
            b.currentLatitude,
            b.currentLongitude,
          );
          return distA - distB;
        });

        // Pegar apenas os 3 motoristas mais próximos
        const nearestDrivers = compatibleDrivers.slice(0, 3);

        // Calcular tempo estimado de chegada do motorista mais próximo
        const nearestDriver = nearestDrivers[0];
        const driverDistance = this.calculateSimpleDistance(
          searchDto.origin.latitude,
          searchDto.origin.longitude,
          nearestDriver.currentLatitude,
          nearestDriver.currentLongitude,
        );
        const estimatedArrival = Math.ceil((driverDistance / 500) * 60); // Aprox 30km/h

        // Filtrar por tempo máximo de espera se especificado
        if (
          searchDto.preferences?.maxWaitTime &&
          estimatedArrival > searchDto.preferences.maxWaitTime
        ) {
          continue;
        }

        availableOptions.push({
          rideType: {
            id: rideType.id,
            name: rideType.name,
            description: rideType.description,
            icon: rideType.icon || '🚗',
            features: rideType.features || [],
            basePrice: rideType.basePrice,
            pricePerKm: rideType.pricePerKm,
            pricePerMinute: rideType.pricePerMinute,
            minimumPrice: rideType.minimumPrice,
            maxPassengers: rideType.maxPassengers,
            isFemaleOnly: rideType.isFemaleOnly,
            allowsPets: rideType.allowsPets,
            isLuxury: rideType.isLuxury,
          },
          availableDrivers: nearestDrivers.map((driver) => ({
            id: driver.id,
            userId: driver.userId,
            name: driver.user.name,
            rating: driver.rating,
            totalRides: driver.totalRides,
            vehicleInfo: {
              make: driver.vehicleMake,
              model: driver.vehicleModel,
              year: driver.vehicleYear,
              color: driver.vehicleColor,
              plate: driver.vehiclePlate,
              type: driver.vehicleType,
            },
            location: {
              latitude: driver.currentLatitude,
              longitude: driver.currentLongitude,
              lastUpdated: driver.lastLocationUpdate,
            },
            distanceFromOrigin: this.calculateSimpleDistance(
              searchDto.origin.latitude,
              searchDto.origin.longitude,
              driver.currentLatitude,
              driver.currentLongitude,
            ),
          })),
          estimatedPrice: Math.round(estimatedPrice * 100) / 100, // Arredondar para 2 casas decimais
          estimatedDuration, // em minutos
          estimatedDistance, // em metros
          estimatedArrival, // tempo para motorista chegar em minutos
          priceBreakdown: {
            basePrice: rideType.basePrice,
            distancePrice: estimatedDistance * rideType.pricePerKm,
            timePrice: estimatedDuration * (rideType.pricePerMinute || 0.5),
            total: estimatedPrice,
          },
        });
      }

      if (availableOptions.length === 0) {
        this.logger.warn('Nenhuma opção de corrida disponível após filtros');
        return {
          success: false,
          data: [],
          metadata: {
            totalOptions: 0,
            searchRadius,
            timestamp: new Date().toISOString(),
            message: 'Nenhum motorista compatível disponível no momento',
          },
        };
      }

      // Ordenar opções por preço (mais barato primeiro)
      availableOptions.sort((a, b) => a.estimatedPrice - b.estimatedPrice);

      this.logger.log(
        `✅ ${availableOptions.length} opções de corrida encontradas`,
      );

      return {
        success: true,
        data: availableOptions,
        metadata: {
          totalOptions: availableOptions.length,
          searchRadius,
          timestamp: new Date().toISOString(),
          routeInfo: {
            estimatedDistance,
            estimatedDuration,
            origin: searchDto.origin,
            destination: searchDto.destination,
          },
        },
      };
    } catch (error) {
      this.logger.error(
        `Erro ao buscar opções de corrida: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        `Erro ao buscar opções de corrida: ${error.message}`,
      );
    }
  }

  // Método auxiliar para buscar motoristas disponíveis em um raio
  private async findAvailableDriversInRadius(
    latitude: number,
    longitude: number,
    radiusInMeters: number,
  ) {
    try {
      // Query raw para buscar motoristas online em um raio específico usando fórmula Haversine
      const drivers = (await this.prisma.$queryRaw`
        SELECT
          d.*,
          u."firstName",
          u."lastName",
          u.email,
          u.phone,
          u.gender,
          u."profileImage",
          (
            6371000 * acos(
              cos(radians(${latitude})) *
              cos(radians(d."currentLatitude")) *
              cos(radians(d."currentLongitude") - radians(${longitude})) +
              sin(radians(${latitude})) *
              sin(radians(d."currentLatitude"))
            )
          ) AS distance
        FROM "Driver" d
        INNER JOIN "User" u ON d."userId" = u.id
        WHERE
          d."isOnline" = true
          AND d."isAvailable" = true
          AND d."currentLatitude" IS NOT NULL
          AND d."currentLongitude" IS NOT NULL
          AND d."lastLocationUpdate" > NOW() - INTERVAL '24 hours'
          AND (
            6371000 * acos(
              cos(radians(${latitude})) *
              cos(radians(d."currentLatitude")) *
              cos(radians(d."currentLongitude") - radians(${longitude})) +
              sin(radians(${latitude})) *
              sin(radians(d."currentLatitude"))
            )
          ) <= ${radiusInMeters}
        ORDER BY distance ASC
      `) as any[];

      return drivers.map((driver) => ({
        ...driver,
        user: {
          firstName: driver.firstName,
          lastName: driver.lastName,
          name: `${driver.firstName} ${driver.lastName}`.trim(),
          email: driver.email,
          phone: driver.phone,
          gender: driver.gender,
          profileImage: driver.profileImage,
        },
      }));
    } catch (error) {
      this.logger.error(
        `Erro ao buscar motoristas disponíveis: ${error.message}`,
      );
      return [];
    }
  }

  // Método auxiliar para calcular distância simples entre dois pontos
  private calculateSimpleDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371000; // Raio da Terra em metros
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // ==================== LIMPEZA DE RIDES ÓRFÃS ====================

  async cleanupOrphanedRides(userId?: string) {
    try {
      this.logger.log('🧹 Iniciando limpeza de rides órfãs/pendentes...');

      // Tempos de expiração diferentes por status
      const requestedCutoffTime = new Date(Date.now() - 15 * 60 * 1000); // 15 minutos para REQUESTED - tempo adequado para notificações
      const acceptedCutoffTime = new Date(Date.now() - 15 * 60 * 1000); // 15 minutos para ACCEPTED
      const inProgressCutoffTime = new Date(Date.now() - 30 * 60 * 1000); // 30 minutos para IN_PROGRESS

      const orphanedRides = await this.prisma.ride.findMany({
        where: {
          OR: [
            {
              status: RideStatus.REQUESTED,
              createdAt: { lt: requestedCutoffTime },
            },
            {
              status: RideStatus.ACCEPTED,
              createdAt: { lt: acceptedCutoffTime },
            },
            {
              status: RideStatus.IN_PROGRESS,
              createdAt: { lt: inProgressCutoffTime },
            },
          ],
        },
        include: {
          Passenger: {
            include: { User: true },
          },
          Driver: {
            include: { User: true },
          },
        },
      });

      if (orphanedRides.length === 0) {
        this.logger.log('✅ Nenhuma ride órfã encontrada');
        return {
          success: true,
          data: {
            clearedRides: 0,
            oldestRideAge: null,
          },
          message: 'Nenhuma ride órfã encontrada',
        };
      }

      this.logger.warn(
        `⚠️ Encontradas ${orphanedRides.length} rides órfãs para limpeza`,
      );

      // Calcular idade da ride mais antiga
      const oldestRide = orphanedRides.reduce((oldest, current) => {
        return current.createdAt < oldest.createdAt ? current : oldest;
      });
      const oldestAge = Math.floor(
        (Date.now() - oldestRide.createdAt.getTime()) / (1000 * 60),
      );

      // Log detalhado das rides que serão removidas
      orphanedRides.forEach((ride) => {
        const ageMinutes = Math.floor(
          (Date.now() - ride.createdAt.getTime()) / (1000 * 60),
        );
        this.logger.warn(
          `🗑️ Removendo ride órfã: ${ride.id} (status: ${
            ride.status
          }, idade: ${ageMinutes}min, passageiro: ${
            ride.Passenger?.User?.firstName || 'N/A'
          })`,
        );
      });

      // Executar limpeza em transação
      const result = await this.prisma.$transaction(
        async (tx) => {
          const rideIds = orphanedRides.map((r) => r.id);

          // 1. Limpar histórico de status
          await tx.rideStatusHistory.deleteMany({
            where: { rideId: { in: rideIds } },
          });

          // 2. Limpar pagamentos relacionados
          await tx.payment.deleteMany({
            where: { rideId: { in: rideIds } },
          });

          // 3. Limpar requests relacionados (RideRequest não tem rideId, pode estar relacionado por passengerId)
          // Buscar passengerIds das rides para limpar requests relacionados
          const passengerIds = orphanedRides
            .map((r) => r.passengerId)
            .filter(Boolean);
          if (passengerIds.length > 0) {
            await tx.rideRequest.deleteMany({
              where: {
                passengerId: { in: passengerIds },
                status: 'PENDING', // Limpar apenas requests pendentes
              },
            });
          }

          // 4. Finalmente, remover as rides
          const deletedRides = await tx.ride.deleteMany({
            where: { id: { in: rideIds } },
          });

          return deletedRides.count;
        },
        {
          timeout: 15000, // Extended timeout for cleanup operations
          isolationLevel: 'ReadCommitted',
        },
      );

      this.logger.log(`✅ Limpeza concluída: ${result} rides órfãs removidas`);

      return {
        success: true,
        data: {
          clearedRides: result,
          oldestRideAge: `${oldestAge} minutos`,
          details: orphanedRides.map((ride) => ({
            id: ride.id,
            status: ride.status,
            passengerName: ride.Passenger?.User?.firstName || 'N/A',
            ageMinutes: Math.floor(
              (Date.now() - ride.createdAt.getTime()) / (1000 * 60),
            ),
          })),
        },
        message: `${result} rides órfãs removidas com sucesso`,
      };
    } catch (error) {
      this.logger.error(
        `❌ Erro na limpeza de rides órfãs: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        data: {
          clearedRides: 0,
          oldestRideAge: null,
        },
        message: `Erro na limpeza: ${error.message}`,
      };
    }
  }

  async getUserRideHistory(userId: string) {
    try {
      // Buscar passageiro do usuário
      const passenger = await this.prisma.passenger.findFirst({
        where: { userId },
      });

      if (!passenger) {
        return {
          success: true,
          data: [],
          message: 'Nenhuma corrida encontrada',
        };
      }

      // Buscar corridas do passageiro (completas e canceladas recentes)
      const rides = await this.prisma.ride.findMany({
        where: {
          passengerId: passenger.id,
          status: {
            in: ['COMPLETED', 'CANCELLED'],
          },
        },
        include: {
          Driver: {
            include: { User: true, Vehicle: true },
          },
          Passenger: {
            include: { User: true },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 20, // Últimas 20 corridas
      });

      // Formatar dados no formato esperado pelo frontend
      const formattedRides = rides.map((ride) => ({
        ride_id: ride.id,
        origin_address: ride.originAddress,
        destination_address: ride.destinationAddress,
        origin_latitude: ride.originLatitude,
        origin_longitude: ride.originLongitude,
        destination_latitude: ride.destinationLatitude,
        destination_longitude: ride.destinationLongitude,
        ride_time: ride.actualDuration
          ? Math.round(ride.actualDuration / 60)
          : 0, // minutos
        fare_price: ride.finalPrice || 0,
        payment_status: ride.status === 'COMPLETED' ? 'paid' : 'cancelled',
        driver_id: ride.Driver ? Number(ride.Driver.id) : 0,
        user_id: userId,
        created_at: ride.createdAt.toISOString(),
        driver: ride.Driver
          ? {
              first_name: ride.Driver.User?.firstName || 'Motorista',
              last_name: ride.Driver.User?.lastName || '',
              car_seats: ride.Driver.Vehicle?.capacity || 4,
            }
          : {
              first_name: 'Motorista',
              last_name: 'Indisponível',
              car_seats: 4,
            },
      }));

      return {
        success: true,
        data: formattedRides,
        message: `${formattedRides.length} corridas encontradas`,
      };
    } catch (error) {
      this.logger.error(
        `❌ Erro ao buscar histórico de corridas: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        data: [],
        message: `Erro ao buscar corridas: ${error.message}`,
      };
    }
  }
}
