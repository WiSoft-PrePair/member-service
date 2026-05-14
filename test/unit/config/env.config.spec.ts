import { loadEnv } from "@/config/env.config";

describe("loadEnv", () => {
  const baseValidEnv = {
    NODE_ENV: "test",
    PORT: "7200",
    DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
    JWT_SECRET: "a-very-secret-key-of-at-least-16-chars",
    SMTP_USER: "test@test.com",
    SMTP_PASS: "password",
    KAKAO_CLIENT_ID: "kakao-id",
    KAKAO_CLIENT_SECRET: "kakao-secret",
    KAKAO_REDIRECT_URI: "http://localhost:4173/callback",
    KAKAO_ALLOWED_REDIRECT_URIS: "http://localhost:4173/callback",
  };

  it("유효한 환경변수를 파싱한다", () => {
    const env: Record<string, unknown> = loadEnv(baseValidEnv);

    expect(env.PORT).toBe(7200);
    expect(env.NODE_ENV).toBe("test");
  });

  it("DATABASE_URL이 없으면 예외를 던진다", () => {
    const { DATABASE_URL, ...rest } = baseValidEnv;

    expect(() => loadEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it("JWT_SECRET이 16자 미만이면 예외를 던진다", () => {
    expect(() => loadEnv({ ...baseValidEnv, JWT_SECRET: "short" })).toThrow(
      /JWT_SECRET/,
    );
  });

  it("PORT를 숫자로 강제 변환한다", () => {
    const env: Record<string, unknown> = loadEnv({
      ...baseValidEnv,
      PORT: "9999",
    });

    expect(env.PORT).toBe(9999);
    expect(typeof env.PORT).toBe("number");
  });
});
