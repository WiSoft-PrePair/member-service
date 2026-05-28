export interface ChangePasswordRequest {
  memberId: string;
  currentPassword: string;
  newPassword: string;
}

export interface ChangePasswordUseCase {
  execute(req: ChangePasswordRequest): Promise<void>;
}
