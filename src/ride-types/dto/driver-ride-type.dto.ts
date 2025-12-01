import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional, IsArray } from 'class-validator';

export class AddDriverRideTypeDto {
  @ApiProperty({
    description: 'ID do motorista',
    example: 'clxxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  })
  @IsString()
  driverId: string;

  @ApiProperty({
    description: 'ID do tipo de corrida',
    example: 'clxxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  })
  @IsString()
  rideTypeId: string;

  @ApiProperty({
    description: 'Se está ativo para o motorista',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateDriverRideTypesDto {
  @ApiProperty({
    description: 'IDs dos tipos de corrida suportados',
    example: [
      'clxxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      'clxxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxy',
    ],
  })
  @IsArray()
  @IsString({ each: true })
  rideTypeIds: string[];
}

export class ToggleDriverRideTypesDto {
  @ApiProperty({
    description: 'IDs dos tipos de corrida que o motorista quer ativar',
    example: [
      'clxxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      'clxxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxy',
    ],
  })
  @IsArray()
  @IsString({ each: true })
  activeRideTypeIds: string[];
}
