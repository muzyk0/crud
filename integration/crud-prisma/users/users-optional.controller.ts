import { Controller } from '@nestjs/common';
import { Crud } from '@nestjsx/crud';

import { User } from './user.model';
import { UsersService } from './users.service';

@Crud({
  model: {
    type: User,
  },
  routes: {
    only: ['getOneBase'],
  },
  params: {
    id: {
      field: 'id',
      type: 'number',
      primary: true,
    },
  },
  query: {
    join: {
      profile: {
        eager: true,
      },
    },
  },
})
@Controller('/users3')
export class UsersOptionalController {
  constructor(public service: UsersService) {}
}
