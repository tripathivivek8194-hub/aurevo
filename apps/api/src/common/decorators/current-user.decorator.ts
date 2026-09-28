import { createParamDecorator, ExecutionContext } from '@nestjs/common';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  [key: string]: unknown;
}

export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as JwtPayload | undefined;

    return data ? user?.[data] : user;
  },
);