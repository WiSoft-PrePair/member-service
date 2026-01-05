export interface EmailService {
  sendVerificationEmail(email: string, code: string): Promise<void>;
}

export const EMAIL_SERVICE = Symbol("EMAIL_SERVICE");
