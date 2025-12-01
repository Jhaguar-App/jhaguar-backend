import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { RideTypesService } from './ride-types.service';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../auth/decorator/user.decorator';
import {
  CreateRideTypeDto,
  UpdateRideTypeDto,
  GetAvailableRideTypesDto,
  CalculateRidePriceDto,
  AddDriverRideTypeDto,
  UpdateDriverRideTypesDto,
  ToggleDriverRideTypesDto,
  RideTypeConfigResponse,
  RidePriceCalculationResponse,
  AvailableDriversResponse,
} from './dto';
import { Gender } from '@prisma/client';

@ApiTags('Tipos de Corrida')
@Controller('ride-types')
export class RideTypesController {
  constructor(private readonly rideTypesService: RideTypesService) {}

  @Get('available')
  @ApiOperation({
    summary: 'Obter tipos de corrida disponíveis',
    description:
      'Lista os tipos de corrida disponíveis baseado no contexto do usuário',
  })
  @ApiQuery({
    name: 'includeDelivery',
    required: false,
    type: Boolean,
    description: 'Incluir tipos de entrega',
  })
  @ApiQuery({
    name: 'hasPets',
    required: false,
    type: Boolean,
    description: 'Usuário tem pets',
  })
  @ApiResponse({
    status: 200,
    description: 'Tipos disponíveis retornados com sucesso',
    type: [RideTypeConfigResponse],
  })
  async getAvailableRideTypes(
    @Query('includeDelivery') includeDelivery?: string,
    @Query('hasPets') hasPets?: string,
    @Query('userGender') userGender?: Gender,
  ) {
    try {
      const availableTypes = await this.rideTypesService.findAvailableRideTypes(
        {
          userGender: userGender || Gender.PREFER_NOT_TO_SAY,
          activeOnly: true,
          includeDelivery: includeDelivery === 'true',
        },
      );

      const enrichedTypes = availableTypes.map((type) => ({
        ...type,
        contextualInfo: this.getContextualInfo(type, hasPets === 'true'),
        estimatedWaitTime: type.availability?.averageEta || 8,
        isAvailable: type.availability?.hasAvailableDrivers || false,
        driversCount: type.availability?.count || 0,
      }));

      return {
        success: true,
        data: enrichedTypes,
        count: enrichedTypes.length,
        context: {
          includeDelivery: includeDelivery === 'true',
          hasPets: hasPets === 'true',
          userGender: userGender || 'NOT_SPECIFIED',
        },
        message: 'Tipos de corrida disponíveis retornados com sucesso',
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        count: 0,
        message:
          error instanceof Error
            ? error.message
            : 'Erro ao buscar tipos disponíveis',
      };
    }
  }

  @Get('suggestions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Obter sugestões inteligentes de tipos de corrida',
    description:
      'Retorna sugestões personalizadas baseadas no perfil do usuário e contexto',
  })
  @ApiQuery({ name: 'lat', description: 'Latitude do usuário', type: Number })
  @ApiQuery({ name: 'lng', description: 'Longitude do usuário', type: Number })
  @ApiQuery({
    name: 'isDelivery',
    required: false,
    type: Boolean,
    description: 'É uma entrega',
  })
  @ApiQuery({
    name: 'hasPets',
    required: false,
    type: Boolean,
    description: 'Tem pets',
  })
  @ApiQuery({
    name: 'distance',
    required: false,
    type: Number,
    description: 'Distância estimada em metros',
  })
  @ApiQuery({
    name: 'duration',
    required: false,
    type: Number,
    description: 'Duração estimada em segundos',
  })
  @ApiResponse({
    status: 200,
    description: 'Sugestões retornadas com sucesso',
  })
  async getSuggestedRideTypes(
    @Query('lat') latitude: string,
    @Query('lng') longitude: string,
    @Query('isDelivery') isDelivery?: string,
    @Query('hasPets') hasPets?: string,
    @Query('distance') distance?: string,
    @Query('duration') duration?: string,
    @User() user?: any,
  ) {
    try {
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      const delivery = isDelivery === 'true';
      const pets = hasPets === 'true';
      const dist = distance ? parseFloat(distance) : undefined;
      const dur = duration ? parseFloat(duration) : undefined;

      if (isNaN(lat) || isNaN(lng)) {
        throw new BadRequestException('Coordenadas inválidas');
      }

      let userGender = Gender.PREFER_NOT_TO_SAY;
      if (user?.id) {
        const userInfo = await this.getUserInfo(user.id);
        userGender = userInfo?.gender || Gender.PREFER_NOT_TO_SAY;
      }

      const suggestions = await this.rideTypesService.getSuggestedRideTypes(
        userGender,
        lat,
        lng,
        delivery,
        pets,
      );

      const enrichedSuggestions = await this.enrichSuggestionsWithPrices(
        suggestions,
        dist,
        dur,
      );

      return {
        success: true,
        data: {
          suggestions: enrichedSuggestions,
          recommended: enrichedSuggestions.find((s) => s.isRecommended),
          context: {
            location: { latitude: lat, longitude: lng },
            isDelivery: delivery,
            hasPets: pets,
            userGender,
            hasDistance: !!dist,
            hasDuration: !!dur,
          },
        },
        message: 'Sugestões geradas com sucesso',
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        message:
          error instanceof Error ? error.message : 'Erro ao gerar sugestões',
      };
    }
  }

  @Post('calculate-price')
  @ApiOperation({
    summary: 'Calcular preço para um tipo de corrida',
    description:
      'Calcula o preço estimado baseado na distância, duração e tipo selecionado',
  })
  @ApiResponse({
    status: 200,
    description: 'Preço calculado com sucesso',
    type: RidePriceCalculationResponse,
  })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 404, description: 'Tipo de corrida não encontrado' })
  async calculateRidePrice(@Body() calculateDto: CalculateRidePriceDto) {
    try {
      const result =
        await this.rideTypesService.calculateRidePrice(calculateDto);

      return {
        success: true,
        data: result,
        message: 'Preço calculado com sucesso',
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        message:
          error instanceof Error ? error.message : 'Erro ao calcular preço',
      };
    }
  }

  @Post('calculate-price/compare')
  @ApiOperation({
    summary: 'Comparar preços entre múltiplos tipos de corrida',
    description: 'Calcula e compara preços para diferentes tipos de corrida',
  })
  @ApiResponse({
    status: 200,
    description: 'Comparação de preços realizada com sucesso',
  })
  async comparePricesForRideTypes(
    @Body()
    compareDto: {
      rideTypeIds: string[];
      distance: number;
      duration: number;
      surgeMultiplier?: number;
      isPremiumTime?: boolean;
    },
  ) {
    try {
      const comparisons = await Promise.allSettled(
        compareDto.rideTypeIds.map(async (rideTypeId) => {
          const result = await this.rideTypesService.calculateRidePrice({
            rideTypeId,
            distance: compareDto.distance,
            duration: compareDto.duration,
            surgeMultiplier: compareDto.surgeMultiplier,
            isPremiumTime: compareDto.isPremiumTime,
          });

          return {
            rideTypeId,
            success: true,
            ...result,
          };
        }),
      );

      const validComparisons = comparisons
        .filter(
          (result): result is PromiseFulfilledResult<any> =>
            result.status === 'fulfilled',
        )
        .map((result) => result.value)
        .sort((a, b) => a.finalPrice - b.finalPrice);

      const failedComparisons = comparisons
        .filter(
          (result): result is PromiseRejectedResult =>
            result.status === 'rejected',
        )
        .map((result, index) => ({
          rideTypeId: compareDto.rideTypeIds[index],
          error: result.reason.message || 'Erro no cálculo',
        }));

      if (validComparisons.length > 1) {
        const maxPrice = Math.max(...validComparisons.map((c) => c.finalPrice));
        validComparisons.forEach((comp) => {
          comp.savings = maxPrice - comp.finalPrice;
          comp.savingsPercentage =
            ((maxPrice - comp.finalPrice) / maxPrice) * 100;
          comp.isRecommended =
            comp.finalPrice === validComparisons[0]?.finalPrice;
        });
      }

      return {
        success: true,
        data: {
          successful: validComparisons,
          failed: failedComparisons,
          summary: {
            cheapest: validComparisons[0],
            mostExpensive: validComparisons[validComparisons.length - 1],
            averagePrice:
              validComparisons.length > 0
                ? validComparisons.reduce(
                    (sum, comp) => sum + comp.finalPrice,
                    0,
                  ) / validComparisons.length
                : 0,
            totalOptions: validComparisons.length,
          },
        },
        message: 'Comparação de preços realizada com sucesso',
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        message:
          error instanceof Error ? error.message : 'Erro ao comparar preços',
      };
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar tipo de corrida por ID' })
  @ApiParam({ name: 'id', description: 'ID do tipo de corrida' })
  @ApiResponse({
    status: 200,
    description: 'Tipo encontrado',
    type: RideTypeConfigResponse,
  })
  @ApiResponse({ status: 404, description: 'Tipo não encontrado' })
  async findRideTypeById(@Param('id') id: string) {
    try {
      const rideType = await this.rideTypesService.findRideTypeById(id);

      return {
        success: true,
        data: rideType,
        message: 'Tipo de corrida encontrado',
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        message: error instanceof Error ? error.message : 'Tipo não encontrado',
      };
    }
  }

  @Get(':id/availability')
  @ApiOperation({
    summary: 'Verificar disponibilidade de motoristas para um tipo',
  })
  @ApiParam({ name: 'id', description: 'ID do tipo de corrida' })
  @ApiResponse({
    status: 200,
    description: 'Disponibilidade verificada',
    type: AvailableDriversResponse,
  })
  async checkAvailability(
    @Param('id') id: string,
    @Query('userGender') userGender?: Gender,
  ) {
    try {
      const availability = await this.rideTypesService[
        'checkDriverAvailability'
      ](id, userGender);

      return {
        success: true,
        data: availability,
        message: 'Disponibilidade verificada com sucesso',
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        message:
          error instanceof Error
            ? error.message
            : 'Erro ao verificar disponibilidade',
      };
    }
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Criar novo tipo de corrida (Admin)' })
  @ApiResponse({
    status: 201,
    description: 'Tipo de corrida criado com sucesso',
    type: RideTypeConfigResponse,
  })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 409, description: 'Tipo já existe' })
  async createRideType(@Body() createRideTypeDto: CreateRideTypeDto) {
    return this.rideTypesService.createRideType(createRideTypeDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos os tipos de corrida' })
  @ApiResponse({
    status: 200,
    description: 'Lista de tipos retornada com sucesso',
    type: [RideTypeConfigResponse],
  })
  async findAllRideTypes() {
    try {
      const rideTypes = await this.rideTypesService.findAllRideTypes();

      return {
        success: true,
        data: rideTypes,
        count: rideTypes.length,
        message: 'Tipos de corrida listados com sucesso',
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        count: 0,
        message:
          error instanceof Error ? error.message : 'Erro ao listar tipos',
      };
    }
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Atualizar tipo de corrida (Admin)' })
  @ApiParam({ name: 'id', description: 'ID do tipo de corrida' })
  @ApiResponse({
    status: 200,
    description: 'Tipo atualizado com sucesso',
    type: RideTypeConfigResponse,
  })
  @ApiResponse({ status: 404, description: 'Tipo não encontrado' })
  async updateRideType(
    @Param('id') id: string,
    @Body() updateRideTypeDto: UpdateRideTypeDto,
  ) {
    return this.rideTypesService.updateRideType(id, updateRideTypeDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Excluir tipo de corrida (Admin)' })
  @ApiParam({ name: 'id', description: 'ID do tipo de corrida' })
  @ApiResponse({ status: 204, description: 'Tipo excluído com sucesso' })
  @ApiResponse({ status: 404, description: 'Tipo não encontrado' })
  @ApiResponse({
    status: 400,
    description: 'Não é possível excluir tipo com corridas associadas',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRideType(@Param('id') id: string) {
    await this.rideTypesService.deleteRideType(id);
  }

  @Get('drivers/my/types')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Obter meus tipos de corrida (motorista autenticado)',
  })
  @ApiResponse({ status: 200, description: 'Tipos retornados com sucesso' })
  @ApiResponse({ status: 404, description: 'Usuário não é motorista' })
  async getMyRideTypes(@User() user: any) {
    if (!user.isDriver || !user.driverId) {
      throw new BadRequestException('Usuário não é um motorista');
    }

    try {
      const rideTypes = await this.rideTypesService.getDriverRideTypes(
        user.driverId,
      );

      return {
        success: true,
        data: rideTypes,
        count: rideTypes.length,
        driverId: user.driverId,
        message: 'Tipos de corrida do motorista retornados com sucesso',
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        count: 0,
        message:
          error instanceof Error
            ? error.message
            : 'Erro ao buscar tipos do motorista',
      };
    }
  }

  @Put('drivers/my/types')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Ativar/desativar categorias autorizadas (motorista autenticado)',
    description:
      'Permite que o motorista escolha quais categorias autorizadas pelo administrador ele quer aceitar corridas. O motorista não pode adicionar novas categorias, apenas ativar ou desativar as que já foram autorizadas.',
  })
  @ApiResponse({ status: 200, description: 'Categorias atualizadas com sucesso' })
  @ApiResponse({ status: 400, description: 'Tentando ativar categorias não autorizadas' })
  @ApiResponse({ status: 404, description: 'Usuário não é motorista' })
  async updateMyRideTypes(
    @Body() updateDto: ToggleDriverRideTypesDto,
    @User() user: any,
  ) {
    if (!user.isDriver || !user.driverId) {
      throw new BadRequestException('Usuário não é um motorista');
    }

    return this.rideTypesService.toggleDriverRideTypes(
      user.driverId,
      updateDto.activeRideTypeIds,
    );
  }

  @Get('drivers/:driverId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Listar tipos de corrida suportados pelo motorista',
  })
  @ApiParam({ name: 'driverId', description: 'ID do motorista' })
  @ApiResponse({ status: 200, description: 'Tipos retornados com sucesso' })
  @ApiResponse({ status: 404, description: 'Motorista não encontrado' })
  async getDriverRideTypes(@Param('driverId') driverId: string) {
    return this.rideTypesService.getDriverRideTypes(driverId);
  }

  @Put('drivers/:driverId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Atualizar tipos de corrida suportados pelo motorista',
  })
  @ApiParam({ name: 'driverId', description: 'ID do motorista' })
  @ApiResponse({ status: 200, description: 'Tipos atualizados com sucesso' })
  @ApiResponse({ status: 404, description: 'Motorista não encontrado' })
  async updateDriverRideTypes(
    @Param('driverId') driverId: string,
    @Body() updateDto: UpdateDriverRideTypesDto,
    @User() user: any,
  ) {
    if (user.driverId !== driverId && !this.isAdmin(user)) {
      throw new ForbiddenException(
        'Você só pode atualizar seus próprios tipos de corrida',
      );
    }

    return this.rideTypesService.updateDriverRideTypes(driverId, updateDto);
  }

  @Post('drivers/:driverId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Adicionar tipo de corrida para motorista' })
  @ApiParam({ name: 'driverId', description: 'ID do motorista' })
  @ApiResponse({ status: 201, description: 'Tipo adicionado com sucesso' })
  @ApiResponse({ status: 400, description: 'Motorista não atende requisitos' })
  @ApiResponse({ status: 404, description: 'Motorista ou tipo não encontrado' })
  async addDriverRideType(
    @Param('driverId') driverId: string,
    @Body() addDriverRideTypeDto: Omit<AddDriverRideTypeDto, 'driverId'>,
  ) {
    return this.rideTypesService.addDriverRideType({
      ...addDriverRideTypeDto,
      driverId,
    });
  }

  @Delete('drivers/:driverId/:rideTypeId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remover tipo de corrida do motorista' })
  @ApiParam({ name: 'driverId', description: 'ID do motorista' })
  @ApiParam({ name: 'rideTypeId', description: 'ID do tipo de corrida' })
  @ApiResponse({ status: 204, description: 'Tipo removido com sucesso' })
  @ApiResponse({ status: 404, description: 'Associação não encontrada' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeDriverRideType(
    @Param('driverId') driverId: string,
    @Param('rideTypeId') rideTypeId: string,
    @User() user: any,
  ) {
    if (user.driverId !== driverId && !this.isAdmin(user)) {
      throw new ForbiddenException(
        'Você só pode remover seus próprios tipos de corrida',
      );
    }

    await this.rideTypesService.removeDriverRideType(driverId, rideTypeId);
  }

  @Get('test')
  @ApiOperation({ summary: 'Teste do módulo de tipos de corrida' })
  @ApiResponse({ status: 200, description: 'Módulo funcionando' })
  testRideTypes() {
    return {
      success: true,
      message: 'Módulo de tipos de corrida funcionando',
      timestamp: new Date().toISOString(),
      availableTypes: [
        'NORMAL',
        'EXECUTIVO',
        'BLINDADO',
        'PET',
        'MULHER',
        'MOTO',
        'DELIVERY',
      ],
      features: {
        dynamicPricing: true,
        driverCompatibilityCheck: true,
        smartSuggestions: true,
        priceComparison: true,
        availabilityCheck: true,
        contextualFiltering: true,
      },
    };
  }

  private isAdmin(user: any): boolean {
    // TODO: Implementar lógica de verificação de admin
    return false;
  }

  private async getUserInfo(userId: string): Promise<any> {
    // Implementar busca de informações do usuário
    try {
      // Este seria o serviço de usuário
      return null;
    } catch {
      return null;
    }
  }

  private getContextualInfo(rideType: any, hasPets: boolean): any {
    const info: any = {
      highlights: [],
      warnings: [],
      estimatedSavings: null,
    };

    if (hasPets && rideType.requiresPetFriendly) {
      info.highlights.push('Veículo preparado para pets');
    }

    if (rideType.type === 'NORMAL') {
      info.highlights.push('Melhor custo-benefício');
    }

    if (rideType.type === 'MOTO') {
      info.highlights.push('Mais rápido no trânsito');
      info.warnings.push('Não adequado para chuva ou bagagem');
    }

    if (rideType.type === 'MULHER') {
      info.highlights.push('Motoristas mulheres verificadas');
    }

    if (rideType.maxDistance) {
      info.warnings.push(
        `Distância máxima: ${(rideType.maxDistance / 1000).toFixed(1)}km`,
      );
    }

    return info;
  }

  private async enrichSuggestionsWithPrices(
    suggestions: any[],
    distance?: number,
    duration?: number,
  ): Promise<any[]> {
    if (!distance || !duration) {
      return suggestions;
    }

    return Promise.all(
      suggestions.map(async (suggestion) => {
        try {
          const priceResult = await this.rideTypesService.calculateRidePrice({
            rideTypeId: suggestion.id,
            distance,
            duration,
            surgeMultiplier: suggestion.surgeMultiplier,
          });

          return {
            ...suggestion,
            estimatedPrice: priceResult.finalPrice,
            priceBreakdown: priceResult.breakdown,
          };
        } catch (error) {
          return suggestion;
        }
      }),
    );
  }
}
