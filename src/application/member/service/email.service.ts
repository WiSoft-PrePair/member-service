export interface EmailService {
  sendVerificationCode(email: string, code: string): Promise<void>;
}

export const EMAIL_SERVICE = Symbol("EMAIL_SERVICE");
