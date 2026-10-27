import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService) {
    // Adapter wajib dibuat sebelum super() dipanggil
    const adapter = new PrismaPg({
      connectionString: config.getOrThrow<string>('DATABASE_URL'),
    });
    super({ adapter });
  }

  // Konek saat aplikasi start, supaya salah konfigurasi langsung ketahuan
  async onModuleInit() {
    await this.$connect();
  }

  // Tutup koneksi saat aplikasi berhenti
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
