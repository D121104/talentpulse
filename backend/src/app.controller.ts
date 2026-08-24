import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public, ResponseMessage } from './decorator/customize';
import { ApiTags } from '@nestjs/swagger';

@Controller()
@ApiTags('App Controller')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Public()
  @ResponseMessage('Welcome to Backend2 API')
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  @Public()
  @ResponseMessage('Health check')
  getHealthCheck() {
    return this.appService.getHealthCheck();
  }
}
