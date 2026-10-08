import { Controller } from '@nestjs/common';
import { Crud } from '@nestjsx/crud';

import { User } from './user.model';
import { UsersService } from './users.service';

@Crud({
  model: {
    type: User,
  },
  params: {
    companyId: {
      field: 'companyId',
      type: 'number',
    },
    id: {
      field: 'id',
      type: 'number',
      primary: true,
    },
  },
  routes: {
    deleteOneBase: {
      returnDeleted: true,
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
@Controller('/companies/:companyId/users')
export class UsersController {
  constructor(public service: UsersService) {}
}
