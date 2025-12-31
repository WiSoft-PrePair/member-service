import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "refresh_tokens" })
export class RefreshTokenEntity {
  @PrimaryKey()
  id!: string;

  @Property()
  memberId!: string;

  @Property({ unique: true })
  token!: string;

  @Property()
  expiresAt!: Date;

  @Property()
  createdAt!: Date;
}
