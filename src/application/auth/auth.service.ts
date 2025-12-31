import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  MEMBER_READ_REPOSITORY,
  MemberReadEntity,
  type MemberReadRepository,
} from "@/adapter/member/persistence/read";
import {
  Password,
  PASSWORD_ENCODER,
  type PasswordEncoder,
} from "@/domain/member";
import { LoginRequestDto } from "@/adapter/auth/api/dto";

@Injectable()
export class AuthService {
  constructor(
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
    @Inject(PASSWORD_ENCODER)
    private readonly passwordEncoder: PasswordEncoder,
  ) {}

  async login(request: LoginRequestDto) {
    const member: MemberReadEntity | null =
      await this.memberReadRepository.findByEmail(request.email);

    if (!member) {
      throw new NotFoundException(`존재하지 않는 회원입니다.`);
    }

    const password: Password = Password.fromHashed(member.password);
    const isValid: boolean = password.matches(
      request.password,
      this.passwordEncoder,
    );

    if (!isValid) {
      throw new UnauthorizedException(
        `이메일 또는 비밀번호가 일치하지 않습니다`,
      );
    }

    return {
      memberId: member.id,
      email: member.email,
    };
  }
}
