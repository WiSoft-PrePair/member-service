export interface PasswordEncoder {
  encode(password: string): string;
  matches(password: string, passwordHash: string): boolean;
}

export const PASSWORD_ENCODER = Symbol("PasswordEncoder");
