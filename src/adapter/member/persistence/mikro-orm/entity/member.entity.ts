import { Entity, Enum, PrimaryKey, Property } from "@mikro-orm/core";
import { FrequencyEnum, NotificationEnum } from "@/domain/member/enums";

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

  @Enum(() => NotificationEnum)
  notification!: NotificationEnum;

  @Enum(() => FrequencyEnum)
  frequency!: FrequencyEnum;

  @Property()
  point!: number;

  @Property()
  isPro!: boolean;
}
