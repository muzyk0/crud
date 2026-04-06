import { CrudValidationGroups } from '@nestjsx/crud';
import { IsBoolean, IsEmail, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

const { CREATE, UPDATE } = CrudValidationGroups;

export class User {
  id?: number;

  @IsOptional({ groups: [UPDATE] })
  @IsNotEmpty({ groups: [CREATE] })
  @IsEmail({}, { always: true })
  email!: string;

  @IsOptional({ groups: [UPDATE] })
  @IsNotEmpty({ groups: [CREATE] })
  @IsBoolean({ always: true })
  isActive!: boolean;

  @IsNumber({}, { always: true })
  @IsOptional({ always: true })
  companyId?: number;

  @IsOptional({ always: true })
  @IsNumber({}, { always: true })
  profileId?: number | null;

  @IsOptional({ always: true })
  nameFirst?: string | null;

  @IsOptional({ always: true })
  nameLast?: string | null;

  deletedAt?: Date | null;

  company?: any;

  profile?: any;

  projects?: any[];
}
