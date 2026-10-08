import { Controller } from '@nestjs/common';
import { Crud } from '@nestjsx/crud';

import { User } from './user.model';
import { UsersService } from './users.service';

@Crud({
  model: {
    type: User,
  },
  params: {
    id: {
      field: 'id',
      type: 'number',
      primary: true,
    },
  },
  query: {
    softDelete: true,
    join: {
      company: {
        exclude: ['description'],
      },
      'company.projects': {
        exclude: ['description'],
      },
      profile: {
        eager: true,
      },
    },
  },
})
@Controller('/users')
export class UsersAllController {
  constructor(public service: UsersService) {}
}
