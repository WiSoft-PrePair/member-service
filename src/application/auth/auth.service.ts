import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  Member,
  MEMBER_REPOSITORY,
  MemberLoginEvent,
  type MemberRepository,
  PASSWORD_ENCODER,
  type PasswordEncoder,
} from "@/domain/member";
import { LoginRequestDto } from "@/adapter/auth/api/dto";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";
import { EventBus } from "@nestjs/cqrs";

@Injectable()
export class AuthService {
  constructor(
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    @Inject(PASSWORD_ENCODER)
    private readonly passwordEncoder: PasswordEncoder,
    private readonly eventBus: EventBus,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  async login(request: LoginRequestDto) {
    this.logger.log("Login attempt started", {
      module: "AuthService",
      email: request.email,
    });

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

    this.eventBus.publish(new MemberLoginEvent(member.id));

    this.logger.log("Login successful", {
      module: "AuthService",
      memberId: member.id,
      email: member.email.value,
    });

    return {
      memberId: member.id,
      email: member.email.value,
      job: member.job,
    };
  }
}
