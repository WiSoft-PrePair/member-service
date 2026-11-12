import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "member" })
export class MemberEntity {
  @PrimaryKey({ type: "uuid" })
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
  point!: number;

  @Property()
  isPro!: boolean;
}
