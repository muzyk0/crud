import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { USER_REQUEST_KEY } from './constants';
import { UsersService } from './users/users.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    req[USER_REQUEST_KEY] = await this.usersService.getAuthenticatedUser();

    return true;
  }
}
