import { MemberEntity } from "@/adapter/member/persistence/mikro-orm/entity/member.entity";
import { Email, Member } from "@/domain/member";

export class MemberMapper {
  toDomain(entity: MemberEntity): Member {
    return new Member({
      id: entity.id,
      email: new Email(entity.email),
      password: entity.password,
      job: entity.job,
      nickname: entity.nickname,
      notification: entity.notification,
      frequency: entity.frequency,
      point: entity.point,
      isPro: entity.isPro,
    });
  }

  toEntity(domain: Member): MemberEntity {
    const entity = new MemberEntity();

    entity.id = domain.id;
    entity.email = domain.email.value;
    entity.password = domain.password;
    entity.job = domain.job;
    entity.nickname = domain.nickname;
    entity.notification = domain.notification;
    entity.frequency = domain.frequency;
    entity.point = domain.point;
    entity.isPro = domain.isPro;

    return entity;
  }
}
