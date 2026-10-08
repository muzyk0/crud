import { CrudValidationGroups } from '@nestjsx/crud';
import { IsBoolean, IsDefined, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

const { CREATE, UPDATE } = CrudValidationGroups;

export class Project {
  id?: number;

  @IsOptional({ groups: [UPDATE] })
  @IsDefined({ groups: [CREATE] })
  @IsString({ always: true })
  @MaxLength(100, { always: true })
  name!: string;

  @IsOptional({ always: true })
  @IsString({ always: true })
  description?: string | null;

  @IsOptional({ always: true })
  @IsBoolean({ always: true })
  isActive?: boolean;

  @IsOptional({ always: true })
  @IsNumber({}, { always: true })
  companyId?: number;

  company?: any;

  users?: any[];
}
