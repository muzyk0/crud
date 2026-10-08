import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UserProfile {
  id?: number;

  @IsOptional({ always: true })
  @IsString({ always: true })
  @MaxLength(32, { always: true })
  name?: string | null;

  deletedAt?: Date | null;
}
