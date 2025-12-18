import { Module } from "@nestjs/common";
import { MemberModule } from "@/application/member/member.module";
import { DatabaseModule } from "@/adapter/member/persistence/database.module";

@Module({
  imports: [MemberModule, DatabaseModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
