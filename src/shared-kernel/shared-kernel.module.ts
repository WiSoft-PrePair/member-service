import { Global, Module } from "@nestjs/common";
import { EventStoreModule } from "@/bounded-context/member/adapter/out/persistence/event-store/event-store.module";

@Global()
@Module({
  imports: [EventStoreModule],
  providers: [],
  exports: [EventStoreModule],
})
export class SharedKernelModule {}
