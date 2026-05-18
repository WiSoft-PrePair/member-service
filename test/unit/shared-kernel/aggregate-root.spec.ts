import { AggregateRoot } from "@/shared-kernel/domain/aggregate-root.base";
import { DomainEvent } from "@/shared-kernel/domain/domain-event.base";

class FooCreated extends DomainEvent<{ name: string }> {
  constructor(aggregateId: string, version: number, name: string) {
    super({
      aggregateId,
      aggregateType: "Foo",
      eventType: "FooCreated",
      eventVersion: version,
      payload: { name },
    });
  }
}

class Foo extends AggregateRoot {
  private _id!: string;
  private _name!: string;

  public get id() {
    return this._id;
  }

  public get aggregateType() {
    return "Foo";
  }

  public get name() {
    return this._name;
  }

  public static create(id: string, name: string): Foo {
    const foo = new Foo();
    foo.apply(new FooCreated(id, 1, name));
    return foo;
  }

  protected when(event: DomainEvent): void {
    if (event.eventType === "FooCreated") {
      const payload = event.payload as { name: string };
      this._id = event.aggregateId;
      this._name = payload.name;
    }
  }

  public createSnapshot(): object {
    return { id: this._id, name: this._name };
  }

  public loadFromSnapshot(snapshot: {
    state: { id: string; name: string };
    version: number;
  }): void {
    this._id = snapshot.state.id;
    this._name = snapshot.state.name;
    this._version = snapshot.version;
  }
}

describe("AggregateRoot", () => {
  it("apply()는 이벤트를 커밋하지 않고 버퍼에 쌓고 version을 올린다", () => {
    const foo: Foo = Foo.create("foo-1", "hello");

    expect(foo.version).toBe(1);
    expect(foo.getUncommittedEvents()).toHaveLength(1);
    expect(foo.name).toBe("hello");
  });

  it("markAsCommitted()로 미커밋 버퍼를 비운다", () => {
    const foo: Foo = Foo.create("foo-1", "hello");

    foo.markAsCommitted();

    expect(foo.getUncommittedEvents()).toHaveLength(0);
    expect(foo.version).toBe(1);
  });

  it("loadFromHistory()로 이벤트 스트림으로부터 상태를 복원한다", () => {
    const events: FooCreated[] = [new FooCreated("foo-1", 1, "replayed")];
    const foo = new (Foo as any)() as Foo;

    foo.loadFromHistory(events);

    expect(foo.version).toBe(1);
    expect(foo.name).toBe("replayed");
    expect(foo.getUncommittedEvents()).toHaveLength(0); // 복원은 미커밋에 쌓지 않는다
  });
});
