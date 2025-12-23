import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["dev", "prod", "test"]),
  POSTGRES_HOST: z.string().default("localhost"),
  POSTGRES_PORT: z.coerce.number().default(5432), // 문자열 → 숫자 변환
  POSTGRES_USER: z.string(),
  POSTGRES_PASSWORD: z.string(),
  POSTGRES_DB: z.string(),
});

export type Env = z.infer<typeof envSchema>;
