import { Entity, Enum, PrimaryKey, Property } from "@mikro-orm/core";
import { FrequencyEnum, NotificationEnum } from "@/domain/member";

@Entity({ tableName: "member_read" })
export class MemberReadEntity {
  @PrimaryKey()
  id!: string;

  @Property()
  email!: string;

  @Property()
  job!: string;

  @Property()
  nickname!: string;

  @Enum(() => NotificationEnum)
  notification!: NotificationEnum;

  @Enum(() => FrequencyEnum)
  frequency!: FrequencyEnum;

  @Property({ default: 0 })
  point!: number;

  @Property({ default: false })
  isPro!: boolean;

  @Property()
  createdAt!: Date;

  @Property({ onUpdate: () => new Date() })
  updatedAt!: Date;

  @Property({ type: "json", nullable: true })
  activity?: string[];
}
