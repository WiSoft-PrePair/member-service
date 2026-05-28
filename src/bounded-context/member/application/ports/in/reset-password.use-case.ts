export interface ResetPasswordRequest {
  email: string;
  verificationCode: string;
}

export interface ResetPasswordResponse {
  memberId: string;
  temporaryPassword: string;
}

export interface ResetPasswordUseCase {
  execute(req: ResetPasswordRequest): Promise<ResetPasswordResponse>;
}
