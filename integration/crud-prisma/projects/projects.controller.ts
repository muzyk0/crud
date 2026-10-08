import { Controller } from '@nestjs/common';
import { Crud, CrudAuth } from '@nestjsx/crud';

import { USER_REQUEST_KEY } from '../constants';
import { User } from '../users/user.model';
import { Project } from './project.model';
import { ProjectsService } from './projects.service';

@Crud({
  model: {
    type: Project,
  },
  routes: {
    only: ['createOneBase', 'deleteOneBase'],
  },
})
@CrudAuth({
  property: USER_REQUEST_KEY,
  filter: (user: User) => ({
    companyId: user.companyId,
  }),
  persist: (user: User) => ({
    companyId: user.companyId,
  }),
})
@Controller('projects')
export class ProjectsController {
  constructor(public service: ProjectsService) {}
}
