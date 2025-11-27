import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import * as bcrypt from 'bcrypt';
import { AuthAction, Status } from '@prisma/client';
import { PaymentsService } from '../payments/payments.service';
import { generateSecureToken, generateJti } from './utils/token.utils';

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const MAX_LOGIN_ATTEMPTS = 5;
const ACCOUNT_LOCK_DURATION_MINUTES = 30;

interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  private userInfoCache = new Map<string, { data: any; expiry: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly paymentsService: PaymentsService,
    private readonly configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto, metadata?: RequestMetadata) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      await this.logAuthEvent({
        email: registerDto.email,
        action: AuthAction.REGISTER,
        success: false,
        failureReason: 'Email já está em uso',
        ...metadata,
      });
      throw new ConflictException('E-mail já está em uso.');
    }

    const existingPhone = await this.prisma.user.findUnique({
      where: { phone: registerDto.phone },
    });

    if (existingPhone) {
      await this.logAuthEvent({
        email: registerDto.email,
        action: AuthAction.REGISTER,
        success: false,
        failureReason: 'Telefone já está em uso',
        ...metadata,
      });
      throw new ConflictException('Telefone já está em uso.');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, BCRYPT_ROUNDS);

    const result = await this.prisma.$transaction(
      async (tx) => {
        const user = await tx.user.create({
          data: {
            email: registerDto.email,
            phone: registerDto.phone,
            firstName: registerDto.firstName,
            lastName: registerDto.lastName,
            password: hashedPassword,
            gender: registerDto.gender,
            dateOfBirth: registerDto.dateOfBirth,
            profileImage: registerDto.profileImage,
            address: registerDto.address,
          },
        });

        if (registerDto.userType === 'PASSENGER') {
          const passenger = await tx.passenger.create({
            data: {
              userId: user.id,
            },
          });
          return { user, passenger, driver: null };
        } else if (registerDto.userType === 'DRIVER') {
          const driver = await tx.driver.create({
            data: {
              userId: user.id,
              licenseNumber: `TEMP-${user.id.substring(0, 8)}`,
              licenseExpiryDate: new Date(
                new Date().setFullYear(new Date().getFullYear() + 1),
              ),
              accountStatus: Status.PENDING,
              backgroundCheckStatus: Status.PENDING,
            },
          });
          return { user, passenger: null, driver };
        }

        throw new Error('Tipo de usuário inválido');
      },
      {
        timeout: 10000,
        isolationLevel: 'ReadCommitted',
      },
    );

    try {
      await this.paymentsService.getOrCreateWallet(result.user.id);
    } catch (error) {
      console.error(`Erro ao criar carteira para usuário ${result.user.id}`);
    }

    await this.logAuthEvent({
      userId: result.user.id,
      email: result.user.email,
      action: AuthAction.REGISTER,
      success: true,
      ...metadata,
    });

    return this.createTokensForUser(result.user.id, result.user.email, metadata);
  }

  async login(loginDto: LoginDto, metadata?: RequestMetadata) {
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
    });

    if (!user) {
      await this.logAuthEvent({
        email: loginDto.email,
        action: AuthAction.LOGIN,
        success: false,
        failureReason: 'Usuário não encontrado',
        ...metadata,
      });
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
      const minutesRemaining = Math.ceil(
        (user.accountLockedUntil.getTime() - Date.now()) / 60000,
      );
      await this.logAuthEvent({
        userId: user.id,
        email: user.email,
        action: AuthAction.LOGIN,
        success: false,
        failureReason: `Conta bloqueada por ${minutesRemaining} minutos`,
        ...metadata,
      });
      throw new UnauthorizedException(
        `Conta temporariamente bloqueada. Tente novamente em ${minutesRemaining} minutos.`,
      );
    }

    const passwordValid = await bcrypt.compare(loginDto.password, user.password);

    if (!passwordValid) {
      const newAttempts = user.failedLoginAttempts + 1;
      const shouldLock = newAttempts >= MAX_LOGIN_ATTEMPTS;

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: newAttempts,
          accountLockedUntil: shouldLock
            ? new Date(Date.now() + ACCOUNT_LOCK_DURATION_MINUTES * 60000)
            : null,
        },
      });

      await this.logAuthEvent({
        userId: user.id,
        email: user.email,
        action: shouldLock ? AuthAction.ACCOUNT_LOCKED : AuthAction.LOGIN,
        success: false,
        failureReason: shouldLock
          ? `Conta bloqueada após ${MAX_LOGIN_ATTEMPTS} tentativas`
          : `Senha incorreta (tentativa ${newAttempts}/${MAX_LOGIN_ATTEMPTS})`,
        ...metadata,
      });

      if (shouldLock) {
        throw new UnauthorizedException(
          `Conta bloqueada por ${ACCOUNT_LOCK_DURATION_MINUTES} minutos após múltiplas tentativas falhas.`,
        );
      }

      throw new UnauthorizedException('Credenciais inválidas.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        accountLockedUntil: null,
      },
    });

    await this.logAuthEvent({
      userId: user.id,
      email: user.email,
      action: AuthAction.LOGIN,
      success: true,
      ...metadata,
    });

    return this.createTokensForUser(user.id, user.email, metadata);
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto, metadata?: RequestMetadata) {
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: refreshTokenDto.refreshToken },
      include: { User: true },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Refresh token inválido.');
    }

    if (storedToken.revokedAt) {
      await this.logAuthEvent({
        userId: storedToken.userId,
        email: storedToken.User.email,
        action: AuthAction.REFRESH_TOKEN,
        success: false,
        failureReason: 'Token revogado',
        ...metadata,
      });
      throw new UnauthorizedException('Refresh token foi revogado.');
    }

    if (storedToken.expiresAt < new Date()) {
      await this.logAuthEvent({
        userId: storedToken.userId,
        email: storedToken.User.email,
        action: AuthAction.REFRESH_TOKEN,
        success: false,
        failureReason: 'Token expirado',
        ...metadata,
      });
      throw new UnauthorizedException('Refresh token expirado.');
    }

    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    await this.logAuthEvent({
      userId: storedToken.userId,
      email: storedToken.User.email,
      action: AuthAction.REFRESH_TOKEN,
      success: true,
      ...metadata,
    });

    return this.createTokensForUser(
      storedToken.userId,
      storedToken.User.email,
      metadata,
      storedToken.token,
    );
  }

  async logout(userId: string, metadata?: RequestMetadata) {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (user) {
      await this.logAuthEvent({
        userId,
        email: user.email,
        action: AuthAction.LOGOUT,
        success: true,
        ...metadata,
      });
    }

    this.clearUserCache(userId);

    return { success: true, message: 'Logout realizado com sucesso' };
  }

  async updateDriverStatus(driverId: string, status: Status) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        User: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!driver) {
      throw new NotFoundException(`Motorista com ID ${driverId} não encontrado`);
    }

    await this.prisma.driver.update({
      where: { id: driverId },
      data: { accountStatus: status },
    });

    this.userInfoCache.delete(driver.userId);

    return {
      success: true,
      message: 'Status do motorista atualizado com sucesso',
    };
  }

  private async createTokensForUser(
    userId: string,
    email: string,
    metadata?: RequestMetadata,
    oldRefreshToken?: string,
  ) {
    const userDetails = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        profileImage: true,
        isAdmin: true,
      },
    });

    if (!userDetails) {
      throw new NotFoundException(`Usuário com ID ${userId} não encontrado`);
    }

    const driver = await this.prisma.driver.findUnique({
      where: { userId },
      select: {
        id: true,
        accountStatus: true,
        licenseNumber: true,
        licenseExpiryDate: true,
        bankAccount: true,
        averageRating: true,
        totalRides: true,
        isAvailable: true,
        isOnline: true,
      },
    });

    const passenger = await this.prisma.passenger.findUnique({
      where: { userId },
      select: {
        id: true,
        averageRating: true,
        totalRides: true,
      },
    });

    const jti = generateJti();
    const iat = Math.floor(Date.now() / 1000);

    const payload = {
      email,
      sub: userId,
      jti,
      iat,
      isDriver: !!driver,
      isPassenger: !!passenger,
      driverId: driver?.id,
      passengerId: passenger?.id,
      driverStatus: driver?.accountStatus,
      isAdmin: userDetails.isAdmin || this.isAdmin(email),
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    const refreshToken = generateSecureToken();
    const refreshTokenExpiry = new Date();
    refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        token: refreshToken,
        expiresAt: refreshTokenExpiry,
        ipAddress: metadata?.ipAddress,
        userAgent: metadata?.userAgent,
        replacedBy: oldRefreshToken,
      },
    });

    const userData = {
      id: userId,
      email: userDetails.email,
      firstName: userDetails.firstName,
      lastName: userDetails.lastName,
      phone: userDetails.phone,
      profileImage: userDetails.profileImage,
      isDriver: !!driver,
      isPassenger: !!passenger,
      driverStatus: driver?.accountStatus || null,
      driverId: driver?.id || null,
      passengerId: passenger?.id || null,
      driverDetails: driver
        ? {
            licenseNumber: driver.licenseNumber,
            licenseExpiryDate: driver.licenseExpiryDate,
            bankAccount: driver.bankAccount,
            averageRating: driver.averageRating,
            totalRides: driver.totalRides,
            isAvailable: driver.isAvailable,
            isOnline: driver.isOnline,
          }
        : null,
      passengerDetails: passenger
        ? {
            averageRating: passenger.averageRating,
            totalRides: passenger.totalRides,
          }
        : null,
    };

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 900,
      token_type: 'Bearer',
      user: userData,
    };
  }

  async getUserInfo(userId: string) {
    const cachedInfo = this.userInfoCache.get(userId);
    const now = Date.now();

    if (cachedInfo && cachedInfo.expiry > now) {
      return cachedInfo.data;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        profileImage: true,
        gender: true,
        address: true,
        createdAt: true,
        updatedAt: true,
        isAdmin: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    const driver = await this.prisma.driver.findUnique({
      where: { userId },
      select: {
        id: true,
        accountStatus: true,
        licenseNumber: true,
        licenseExpiryDate: true,
        bankAccount: true,
        averageRating: true,
        totalRides: true,
        isAvailable: true,
        isOnline: true,
        currentLatitude: true,
        currentLongitude: true,
        acceptsFemaleOnly: true,
        Vehicle: true,
      },
    });

    const passenger = await this.prisma.passenger.findUnique({
      where: { userId },
      select: {
        id: true,
        averageRating: true,
        totalRides: true,
        prefersFemaleDriver: true,
        specialNeeds: true,
      },
    });

    const result = {
      ...user,
      isAdmin: user.isAdmin,
      isDriver: !!driver,
      isPassenger: !!passenger,
      driverStatus: driver?.accountStatus || null,
      driverId: driver?.id || null,
      passengerId: passenger?.id || null,
      vehicle: driver?.Vehicle || null,
      driverDetails: driver
        ? {
            licenseNumber: driver.licenseNumber,
            licenseExpiryDate: driver.licenseExpiryDate,
            bankAccount: driver.bankAccount,
            averageRating: driver.averageRating,
            totalRides: driver.totalRides,
            isAvailable: driver.isAvailable,
            isOnline: driver.isOnline,
            currentLatitude: driver.currentLatitude,
            currentLongitude: driver.currentLongitude,
            acceptsFemaleOnly: driver.acceptsFemaleOnly,
          }
        : null,
      passengerDetails: passenger
        ? {
            averageRating: passenger.averageRating,
            totalRides: passenger.totalRides,
            prefersFemaleDriver: passenger.prefersFemaleDriver,
            specialNeeds: passenger.specialNeeds,
          }
        : null,
    };

    this.userInfoCache.set(userId, {
      data: result,
      expiry: now + 5000,
    });

    return result;
  }

  private async logAuthEvent(data: {
    userId?: string;
    email: string;
    action: AuthAction;
    success: boolean;
    ipAddress?: string;
    userAgent?: string;
    failureReason?: string;
  }) {
    try {
      await this.prisma.authLog.create({
        data: {
          userId: data.userId,
          email: data.email,
          action: data.action,
          success: data.success,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          failureReason: data.failureReason,
        },
      });
    } catch (error) {
      console.error('Erro ao criar log de autenticação');
    }
  }

  clearUserCache(userId: string) {
    this.userInfoCache.delete(userId);
  }

  clearAllCache() {
    this.userInfoCache.clear();
  }

  async cleanExpiredRefreshTokens() {
    const deleted = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          {
            revokedAt: {
              lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
            },
          },
        ],
      },
    });
    return deleted.count;
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: forgotPasswordDto.email },
    });

    if (!user) {
      // Retornar sucesso mesmo se não encontrar para evitar enumeração de usuários
      return {
        success: true,
        message: 'Se o email existir, você receberá um link para redefinir sua senha.',
      };
    }

    const token = this.jwtService.sign(
      { sub: user.id, type: 'reset' },
      { expiresIn: '1h' },
    );

    await this.logAuthEvent({
      userId: user.id,
      email: user.email,
      action: AuthAction.PASSWORD_RESET,
      success: true,
      failureReason: 'Solicitação de redefinição de senha',
    });

    // TODO: Integrar com serviço de email real
    console.log(`[RESET PASSWORD] Token para ${user.email}: ${token}`);

    return {
      success: true,
      message: 'Se o email existir, você receberá um link para redefinir sua senha.',
      // debug_token: token, // Remover em produção
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    try {
      const payload = this.jwtService.verify(resetPasswordDto.token);

      if (payload.type !== 'reset') {
        throw new UnauthorizedException('Token inválido para redefinição de senha.');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new NotFoundException('Usuário não encontrado.');
      }

      const hashedPassword = await bcrypt.hash(resetPasswordDto.password, BCRYPT_ROUNDS);

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          failedLoginAttempts: 0,
          accountLockedUntil: null,
        },
      });

      await this.logAuthEvent({
        userId: user.id,
        email: user.email,
        action: AuthAction.PASSWORD_CHANGE,
        success: true,
        failureReason: 'Senha redefinida com sucesso',
      });

      return {
        success: true,
        message: 'Senha redefinida com sucesso.',
      };
    } catch (error) {
      throw new UnauthorizedException('Token inválido ou expirado.');
    }
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    const passwordValid = await bcrypt.compare(
      changePasswordDto.currentPassword,
      user.password,
    );

    if (!passwordValid) {
      await this.logAuthEvent({
        userId: user.id,
        email: user.email,
        action: AuthAction.PASSWORD_CHANGE,
        success: false,
        failureReason: 'Senha atual incorreta',
      });
      throw new UnauthorizedException('A senha atual está incorreta.');
    }

    const hashedPassword = await bcrypt.hash(
      changePasswordDto.newPassword,
      BCRYPT_ROUNDS,
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
      },
    });

    await this.logAuthEvent({
      userId: user.id,
      email: user.email,
      action: AuthAction.PASSWORD_CHANGE,
      success: true,
      failureReason: 'Senha alterada com sucesso',
    });

    return {
      success: true,
      message: 'Senha alterada com sucesso.',
    };
  }

  private isAdmin(email: string): boolean {
    const adminEmails = this.configService.get<string>('ADMIN_EMAILS') || '';
    const admins = adminEmails.split(',').map((e) => e.trim());
    return admins.includes(email);
  }
}
