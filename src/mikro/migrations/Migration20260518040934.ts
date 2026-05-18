import { Migration } from "@mikro-orm/migrations";

export class Migration20260518040934 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table "aggregate_snapshot" ("aggregate_id" uuid not null, "version" int not null, "aggregate_type" varchar(50) not null, "state" jsonb not null, "created_at" timestamptz not null, constraint "aggregate_snapshot_pkey" primary key ("aggregate_id", "version"));`,
    );

    this.addSql(
      `create table "event_store" ("sequence" bigserial primary key, "event_id" uuid not null, "aggregate_id" uuid not null, "aggregate_type" varchar(50) not null, "event_type" varchar(100) not null, "event_version" int not null, "payload" jsonb not null, "metadata" jsonb null, "occurred_at" timestamptz not null);`,
    );
    this.addSql(
      `alter table "event_store" add constraint "event_store_event_id_unique" unique ("event_id");`,
    );
    this.addSql(
      `create index "event_store_aggregate_type_event_type_index" on "event_store" ("aggregate_type", "event_type");`,
    );
    this.addSql(
      `create index "event_store_aggregate_id_event_version_index" on "event_store" ("aggregate_id", "event_version");`,
    );
    this.addSql(
      `alter table "event_store" add constraint "event_store_aggregate_id_event_version_unique" unique ("aggregate_id", "event_version");`,
    );
  }
}
