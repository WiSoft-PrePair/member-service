import { IsNotEmpty, IsOptional, IsString, IsUrl } from "class-validator";

export class OauthCallbackDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsUrl({ require_tld: false, require_protocol: true })
  @IsOptional()
  redirectUri?: string;
}
