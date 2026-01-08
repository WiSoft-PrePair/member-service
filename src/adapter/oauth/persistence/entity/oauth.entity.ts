import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "oauth_connections" })
export class OAuthConnectionEntity {
  @PrimaryKey({ type: "uuid" })
  id!: string;

  @Property({ type: "uuid" })
  memberId!: string;

  @Property()
  provider!: string;

  @Property()
  providerId!: string;

  @Property()
  email!: string;

  @Property()
  connectedAt!: Date;
}
