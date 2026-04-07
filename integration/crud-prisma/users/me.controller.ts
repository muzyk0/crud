import { Controller } from '@nestjs/common';
import { Crud, CrudAuth } from '@nestjsx/crud';

import { USER_REQUEST_KEY } from '../constants';
import { User } from './user.model';
import { UsersService } from './users.service';

@Crud({
  model: {
    type: User,
  },
  routes: {
    only: ['getOneBase', 'updateOneBase'],
  },
  params: {
    id: {
      primary: true,
      disabled: true,
    },
  },
  query: {
    join: {
      company: {
        eager: true,
      },
      profile: {
        eager: true,
      },
    },
  },
})
@CrudAuth({
  property: USER_REQUEST_KEY,
  filter: (user: User) => ({
    id: user.id,
  }),
  persist: (user: User) => ({
    email: user.email,
  }),
})
@Controller('me')
export class MeController {
  constructor(public service: UsersService) {}
}
