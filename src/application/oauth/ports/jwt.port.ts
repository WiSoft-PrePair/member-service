export interface JwtToken {
  accessToken: string;
  expiresIn: number;
}

export interface JwtPayload {
  sub: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface JwtPort {
  generateAccessToken(memberId: string, email: string): JwtToken;

  verifyToken(token: string): JwtPayload;
}

export const JWT_SERVICE = Symbol("JwtService");
