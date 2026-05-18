import { MikroORM } from "@mikro-orm/postgresql";
import { Test, TestingModule } from "@nestjs/testing";
import { AppModule } from "@/app.module";
import { MikroEventStore } from "@/bounded-context/member/adapter/out/persistence/event-store/event-store.impl";
import { ConcurrencyException } from "@/bounded-context/member/application/ports/out/event-store.exceptions";
import { DomainEvent } from "@/shared-kernel/domain/domain-event.base";

class TestEvent extends DomainEvent<{ msg: string }> {
  constructor(aggregateId: string, version: number, msg: string) {
    super({
      aggregateId,
      aggregateType: "Test",
      eventType: "TestEvent",
      eventVersion: version,
      payload: { msg },
    });
  }
}

describe("MikroEventStore (integration)", () => {
  let store: MikroEventStore;
  let orm: MikroORM;

  beforeAll(async () => {
    const mod: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    store = mod.get(MikroEventStore);
    orm = mod.get(MikroORM);

    await orm.schema.refreshDatabase();
  });

  afterAll(async () => {
    if (orm) orm.close();
  });

  it("이벤트를 저장하고 다시 로드할 수 있다", async () => {
    const aggId: string = crypto.randomUUID();
    await store.append(aggId, 0, [new TestEvent(aggId, 1, "first")]);

    const events: DomainEvent[] = await store.loadEvents(aggId);

    expect(events).toHaveLength(1);
    expect(events[0].payload).toEqual({ msg: "first" });
  });

  it("expectedVersion 불일치 시 ConcurrencyException", async () => {
    const aggId: string = crypto.randomUUID();

    await store.append(aggId, 0, [new TestEvent(aggId, 1, "first")]);

    await expect(
      store.append(aggId, 0, [new TestEvent(aggId, 1, "duplicate")]),
    ).rejects.toBeInstanceOf(ConcurrencyException);
  });

  it("loadEventsByType은 같은 타입의 이벤트만 전역 순서로 가져온다", async () => {
    const events: DomainEvent[] = await store.loadEventsByType("Test");

    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.aggregateType === "Test")).toBe(true);
  });
});
