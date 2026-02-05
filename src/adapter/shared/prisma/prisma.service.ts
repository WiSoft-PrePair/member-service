import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@/generated/prisma/client";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(private readonly configService: ConfigService) {
    const adapter = new PrismaPg({
      connectionString: configService.getOrThrow<string>("DATABASE_URL"),
    });

    super({ adapter });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$connect();
  }

  async onModuleInit(): Promise<void> {
    await this.$disconnect();
  }
}
