import { Module } from "@nestjs/common";
import { EVENT_STORE } from "@/domain/shared";
import { EventStoreImpl } from "@/adapter/shared/event-store/event-store.impl";

@Module({
  providers: [
    {
      provide: EVENT_STORE,
      useClass: EventStoreImpl,
    },
  ],
  exports: [EVENT_STORE],
})
export class EventStoreModule {}
