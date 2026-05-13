import { Schema } from "effect";

const CsvStringArray = Schema.transform(
  Schema.String,
  Schema.Array(Schema.String),
  {
    decode: (csv) =>
      csv
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    encode: (arr) => arr.join(","),
  },
);

export const EnvSchema = Schema.Struct({
  // App
  NODE_ENV: Schema.Literal("development", "test", "production"),
  PORT: Schema.NumberFromString.pipe(Schema.int(), Schema.positive()),

  // Database
  DATABASE_URL: Schema.String.pipe(Schema.startsWith("postgres")),

  // JWT — 변수명은 기존 .env 컨벤션 유지 (@nestjs/jwt signOptions.expiresIn 호환)
  JWT_SECRET: Schema.String.pipe(Schema.minLength(32)),
  JWT_ACCESS_TOKEN_EXPIRES_IN: Schema.String,
  JWT_REFRESH_TOKEN_EXPIRES_IN: Schema.String,

  // SMTP (Phase 3: 이메일 인증)
  SMTP_HOST: Schema.optional(Schema.String),
  SMTP_PORT: Schema.optional(Schema.NumberFromString),
  SMTP_USER: Schema.optional(Schema.String),
  SMTP_PASS: Schema.optional(Schema.String),
  SMTP_FROM: Schema.optional(Schema.String),

  // Kakao OAuth (Phase 5)
  KAKAO_CLIENT_ID: Schema.optional(Schema.String),
  KAKAO_CLIENT_SECRET: Schema.optional(Schema.String),
  KAKAO_REDIRECT_URI: Schema.optional(Schema.String),
  KAKAO_ALLOWED_REDIRECT_URIS: Schema.optional(CsvStringArray),

  // Logging (Phase 6)
  LOG_LEVEL: Schema.optional(
    Schema.Literal("trace", "debug", "info", "warn", "error", "fatal"),
  ),
  SERVICE_NAME: Schema.optional(Schema.String),

  // S3 (파일 업로드 — 별도 Phase에서 다룰 예정이지만 EnvSchema는 미리 등록)
  AWS_ACCESS_KEY_ID: Schema.optional(Schema.String),
  AWS_SECRET_ACCESS_KEY: Schema.optional(Schema.String),
  AWS_REGION: Schema.optional(Schema.String),
  S3_BUCKET_NAME: Schema.optional(Schema.String),
  S3_ENDPOINT: Schema.optional(Schema.String),
});

export type Env = Schema.Schema.Type<typeof EnvSchema>;

const decode = Schema.decodeUnknownSync(EnvSchema);

// NestJS ConfigModule이 호출하는 validator. throw 가능 (NestJS 측 책임).
export function loadEnv(raw: Record<string, unknown>): Env {
  try {
    return decode({
      ...raw,
      JWT_ACCESS_TOKEN_EXPIRES_IN: raw.JWT_ACCESS_TOKEN_EXPIRES_IN ?? "15m",
      JWT_REFRESH_TOKEN_EXPIRES_IN: raw.JWT_REFRESH_TOKEN_EXPIRES_IN ?? "14d",
      LOG_LEVEL: raw.LOG_LEVEL ?? "info",
    });
  } catch (err) {
    throw new Error(`Invalid env:\n${String(err)}`);
  }
}
