import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { MemberReadEntity } from "@/adapter/member/persistence/read";
import {
  MEMBER_READ_REPOSITORY,
  type MemberReadRepository,
} from "@/application/member/ports";
import {
  Member,
  MEMBER_REPOSITORY,
  type MemberRepository,
  PASSWORD_ENCODER,
  type PasswordEncoder,
} from "@/domain/member";
import { LoginRequestDto } from "@/adapter/auth/api/dto";
import { EntityManager } from "@mikro-orm/postgresql";

@Injectable()
export class AuthService {
  constructor(
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
    @Inject(PASSWORD_ENCODER)
    private readonly passwordEncoder: PasswordEncoder,
    private readonly em: EntityManager,
  ) {}

  async login(request: LoginRequestDto) {
    const member: Member | null = await this.memberRepository.findByEmail(
      request.email,
    );

    if (!member) {
      throw new NotFoundException(`존재하지 않는 회원입니다.`);
    }

    const isValid: boolean = member.password.matches(
      request.password,
      this.passwordEncoder,
    );

    if (!isValid) {
      throw new UnauthorizedException(
        `이메일 또는 비밀번호가 일치하지 않습니다`,
      );
    }

    // Update activity in read model
    const readEntity: MemberReadEntity | null =
      await this.memberReadRepository.findByEmail(request.email);

    if (readEntity) {
      const today: string = new Date().toISOString().slice(0, 10);
      readEntity.activity = readEntity.activity ?? [];

      if (!readEntity.activity.includes(today)) {
        readEntity.activity.push(today);
      }

      await this.em.flush();
    }

    return {
      memberId: member.id,
      email: member.email.value,
    };
  }
}
