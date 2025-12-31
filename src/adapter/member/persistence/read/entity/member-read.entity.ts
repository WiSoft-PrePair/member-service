import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "member_read" })
export class MemberReadEntity {
  @PrimaryKey()
  id!: string;

  @Property()
  email!: string;

  @Property()
  password!: string;

  @Property()
  job!: string;

  @Property()
  nickname!: string;

  @Property()
  notification!: string;

  @Property()
  frequency!: string;

  @Property({ default: 0 })
  point!: number;

  @Property({ default: false })
  isPro!: boolean;

  @Property()
  createdAt!: Date;

  @Property({ onUpdate: () => new Date() })
  updatedAt!: Date;
}
