import { Params } from "nestjs-pino";
import path from "node:path";

const isProduction =
  process.env.NODE_ENV === "prod" || process.env.NODE_ENV === "production";

const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, "../../logs");

export const loggingConfig: Params = {
  pinoHttp: {
    level: process.env.LOG_LEVEL || "info",
    messageKey: "message",
    transport: !isProduction
      ? {
          // 개발 환경: 콘솔에 예쁘게 출력
          target: "pino-pretty",
          options: {
            colorize: true,
            ignore: "pid,hostname",
          },
        }
      : {
          // 프로덕션 환경: 파일 저장 (Fluent Bit 수집용)
          targets: [
            {
              target: "pino/file",
              level: "info",
              options: {
                destination: path.join(LOG_DIR, "app.log"),
                mkdir: true,
                sync: true, // 실시간 로그 전송을 위한 동기 쓰기
              },
            },
            {
              // stdout에도 JSON 출력 (Docker logging driver용)
              target: "pino/file",
              level: "info",
              options: {
                destination: 1, // 1 = stdout
                sync: true,
              },
            },
          ],
        },
    customProps: () => ({
      service: process.env.SERVICE_NAME || "prepair-member-service",
      environment: process.env.NODE_ENV || "development",
    }),
    // transport.targets 사용 시 formatters는 개발 환경에서만 적용
    formatters: !isProduction
      ? {
          level: (label: string) => {
            return { level: label.toUpperCase() };
          },
          bindings: () => ({}),
        }
      : undefined,
    serializers: {
      req: () => undefined,
      res: () => undefined,
    },
    redact: {
      paths: ["req.headers.authorization", "req.body.password"],
      remove: true,
    },
  },
};

export const fileLoggingConfig: Params = {
  ...loggingConfig,
  pinoHttp: {
    ...loggingConfig.pinoHttp,
    transport: {
      targets: [
        // 콘솔 출력 (개발용)
        {
          target: "pino-pretty",
          level: "info",
          options: {
            colorize: true,
            ignore: "pid,hostname",
          },
        },

        // 파일 출력 (Fluentbit 수집용)
        {
          target: "pino/file",
          level: "info",
          options: {
            destination: path.join(LOG_DIR, "app.log"),
            mkdir: true,
            sync: true, // 실시간 로그 전송을 위한 동기 쓰기
          },
        },
      ],
    },
  },
};
