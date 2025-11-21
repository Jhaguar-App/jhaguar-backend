import { Body, Controller, Get, Post, UseGuards, Req, Ip } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { User } from './decorator/user.decorator';

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle(3, 300)
  @ApiOperation({ summary: 'Registrar um novo usuário' })
  @ApiResponse({
    status: 201,
    description: 'Usuário registrado com sucesso',
  })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 429, description: 'Muitas tentativas de registro' })
  async register(
    @Body() registerDto: RegisterDto,
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    return this.authService.register(registerDto, {
      ipAddress: ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('login')
  @Throttle(5, 60)
  @ApiOperation({ summary: 'Autenticar usuário' })
  @ApiResponse({
    status: 200,
    description: 'Usuário autenticado com sucesso',
  })
  @ApiResponse({ status: 401, description: 'Credenciais inválidas' })
  @ApiResponse({ status: 429, description: 'Muitas tentativas de login' })
  async login(
    @Body() loginDto: LoginDto,
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    return this.authService.login(loginDto, {
      ipAddress: ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('refresh')
  @Throttle(10, 60)
  @ApiOperation({ summary: 'Renovar access token usando refresh token' })
  @ApiResponse({
    status: 200,
    description: 'Token renovado com sucesso',
  })
  @ApiResponse({ status: 401, description: 'Refresh token inválido ou expirado' })
  async refreshToken(
    @Body() refreshTokenDto: RefreshTokenDto,
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    return this.authService.refreshToken(refreshTokenDto, {
      ipAddress: ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Fazer logout e invalidar refresh tokens' })
  @ApiResponse({
    status: 200,
    description: 'Logout realizado com sucesso',
  })
  async logout(
    @User() user: any,
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    return this.authService.logout(user.id, {
      ipAddress: ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obter informações do usuário autenticado' })
  @ApiResponse({
    status: 200,
    description: 'Informações do usuário retornadas com sucesso',
  })
  async getUserInfo(@User() user: any) {
    return this.authService.getUserInfo(user.id);
  }
  @Post('forgot-password')
  @Throttle(3, 300)
  @ApiOperation({ summary: 'Solicitar redefinição de senha' })
  @ApiResponse({
    status: 200,
    description: 'Email de redefinição enviado (se o usuário existir)',
  })
  async forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordDto,
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Post('reset-password')
  @Throttle(3, 300)
  @ApiOperation({ summary: 'Redefinir senha usando token' })
  @ApiResponse({
    status: 200,
    description: 'Senha redefinida com sucesso',
  })
  @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
  async resetPassword(
    @Body() resetPasswordDto: ResetPasswordDto,
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    return this.authService.resetPassword(resetPasswordDto);
  }
}
