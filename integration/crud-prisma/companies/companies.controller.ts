import { Controller } from '@nestjs/common';
import { Crud } from '@nestjsx/crud';

import { Company } from './company.model';
import { CompaniesService } from './companies.service';

@Crud({
  model: {
    type: Company,
  },
  routes: {
    deleteOneBase: {
      returnDeleted: false,
    },
  },
  query: {
    softDelete: true,
  },
})
@Controller('companies')
export class CompaniesController {
  constructor(public service: CompaniesService) {}
}
