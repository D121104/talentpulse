import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LocalAuthGuard } from './local-auth.guard';
import { GoogleExchangeDto } from './dto/google-exchange.dto';
import { LoginDto } from './dto/login.dto';
import { Public, User } from 'src/decorator/customize';
import { IUser } from 'src/users/users.interface';
import { CreateUserDto } from 'src/users/dto/create-user.dto';
import { CreateHrDto } from 'src/users/dto/create-hr.dto';

@Controller('auth')
@ApiTags('Auth Controller')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiBody({ type: LoginDto })
  @Post('login')
  handleLogin(
    @Body() _loginDto: LoginDto,
    @Req() request: Request & { user: IUser },
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.login(request.user, response);
  }

  @Public()
  @ApiOperation({ summary: 'Register a Candidate account' })
  @Post('register')
  handleRegister(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }

  @Public()
  @ApiOperation({ summary: 'Register an HR account pending approval' })
  @Post('hr/register')
  handleRegisterHr(@Body() createHrDto: CreateHrDto) {
    return this.authService.registerHr(createHrDto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current account' })
  @ApiBearerAuth()
  @Get('account')
  handleAccount(@User() user: IUser) {
    return this.authService.handleAccount(user);
  }

  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth() {
    // Passport redirects the browser to Google's consent screen.
  }

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() request: Request & { user: any }, @Res() response: Response) {
    const frontendUrl = (
      this.configService.get<string>('URL_FRONTEND') || 'http://localhost:5173'
    ).replace(/\/$/, '');

    try {
      if (!request.user) {
        return response.redirect(`${frontendUrl}/login?error=google_auth_failed`);
      }
      const code = await this.authService.createGoogleExchangeCode(request.user);
      return response.redirect(`${frontendUrl}/auth/google/callback?code=${encodeURIComponent(code)}`);
    } catch (error) {
      return response.redirect(`${frontendUrl}/login?error=google_auth_failed`);
    }
  }

  @Public()
  @ApiOperation({ summary: 'Exchange a Google OAuth code for a session' })
  @Post('google/exchange')
  exchangeGoogleCode(
    @Body() dto: GoogleExchangeDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.exchangeGoogleCode(dto.code, response);
  }

  @Public()
  @ApiOperation({ summary: 'Refresh the current session from a cookie' })
  @Post('refresh')
  handleRefresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies?.refresh_token;
    if (!refreshToken) {
      throw new BadRequestException('Refresh token không tồn tại');
    }
    return this.authService.generateNewToken(refreshToken, response);
  }

  @Public()
  @ApiOperation({ summary: 'Reset a password with an OTP token' })
  @Post('reset-password')
  handleResetPassword(@Body() body: { token: string; password: string }) {
    return this.authService.resetPassword(body.token, body.password);
  }

  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Logout and revoke the current refresh token' })
  @ApiBearerAuth()
  @Post('logout')
  handleLogout(@Res({ passthrough: true }) response: Response, @User() user: IUser) {
    return this.authService.logout(user, response);
  }
}
