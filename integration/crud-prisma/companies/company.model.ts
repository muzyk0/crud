import { CrudValidationGroups } from '@nestjsx/crud';
import { IsEmpty, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

const { CREATE, UPDATE } = CrudValidationGroups;

export class Company {
  @IsOptional({ groups: [UPDATE] })
  @IsEmpty({ groups: [CREATE] })
  @IsNumber({}, { groups: [UPDATE] })
  id?: number;

  @IsOptional({ groups: [UPDATE] })
  @IsNotEmpty({ groups: [CREATE] })
  @IsString({ always: true })
  @MaxLength(100, { always: true })
  name!: string;

  @IsOptional({ groups: [UPDATE] })
  @IsNotEmpty({ groups: [CREATE] })
  @IsString({ groups: [CREATE, UPDATE] })
  @MaxLength(100, { groups: [CREATE, UPDATE] })
  domain!: string;

  @IsOptional({ always: true })
  @IsString({ always: true })
  description?: string | null;

  deletedAt?: Date | null;

  users?: any[];

  projects?: any[];
}
