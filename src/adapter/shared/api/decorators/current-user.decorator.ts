import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface User {
  memberId: string;
  email: string;
  job: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => {
    const request: { user: User } = ctx
      .switchToHttp()
      .getRequest<{ user: User }>();
    return request.user;
  },
);
