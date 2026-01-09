import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class OauthCallbackDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsOptional()
  state?: string;
}
