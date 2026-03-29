import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { MobileController } from './mobile.controller';
import { RoleGuard } from './guards/role.guard';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev_only_change_me',
      signOptions: { expiresIn: '1h' },
    }),
  ],
  controllers: [MobileController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: RoleGuard,
    },
  ],
})
export class AppModule {}

