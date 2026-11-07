import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["dev", "development", "prod", "production", "test"]),
  PORT: z.coerce.number(),
  POSTGRES_HOST: z.string().default("localhost"),
  POSTGRES_PORT: z.coerce.number().default(5432),
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
  KAKAO_ALLOWED_REDIRECT_URIS: z.string().default(""),

  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
  SERVICE_NAME: z.string().default("prepair-member-service"),

  INTERNAL_API_KEY: z.string(),
});

export type Env = z.infer<typeof envSchema>;
