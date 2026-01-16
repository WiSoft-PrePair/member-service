import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["dev", "prod", "test"]),
  POSTGRES_HOST: z.string().default("localhost"),
  POSTGRES_PORT: z.coerce.number().default(5432), // 문자열 → 숫자 변환
  POSTGRES_USER: z.string(),
  POSTGRES_PASSWORD: z.string(),
  POSTGRES_DB: z.string(),

  JWT_SECRET: z.string().default("secret"),
  JWT_ACCESS_TOKEN_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_TOKEN_EXPIRES_IN: z.string().default("7d"),

  SMTP_HOST: z.string(),
  SMTP_USER: z.string(),
  SMTP_PASS: z.string(),
  SMTP_FROM: z.string(),

  KAKAO_CLIENT_ID: z.string(),
  KAKAO_CLIENT_SECRET: z.string(),
  KAKAO_REDIRECT_URI: z.string(),

  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
  SERVICE_NAME: z.string().default("prepair-member-service"),
});

export type Env = z.infer<typeof envSchema>;
