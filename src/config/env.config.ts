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
});

export type Env = z.infer<typeof envSchema>;
