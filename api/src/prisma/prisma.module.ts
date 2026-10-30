import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// @Global: cukup di-import sekali di AppModule, modul lain tinggal inject PrismaService
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
