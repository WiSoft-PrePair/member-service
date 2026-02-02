import { Params } from "nestjs-pino";

export const getLoggingConfig = (): Params => {
  const isDevelopment =
    process.env.NODE_ENV === "dev" || process.env.NODE_ENV === "development";
  const hasPinoPretty = (() => {
    try {
      require.resolve("pino-pretty");
      return true;
    } catch {
      return false;
    }
  })();

  // 한국 시간(UTC+9)으로 ISO 8601 형식 생성
  const formatKSTTimestamp = (): string => {
    const now = new Date();
    const kstTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const isoString = kstTime.toISOString();
    return isoString.replace("Z", "+09:00");
  };

  return {
    pinoHttp: {
      level: process.env.LOG_LEVEL || "info",
      messageKey: "message",
      timestamp: () => `,"timestamp":"${formatKSTTimestamp()}"`,
      // 프로덕션: transport 없이 JSON 직접 출력, 개발: pino-pretty 사용
      transport:
        isDevelopment && hasPinoPretty
          ? {
              target: "pino-pretty",
              options: {
                colorize: true,
                ignore: "pid,hostname",
              },
            }
          : undefined,
      customProps: () => ({
        service: process.env.SERVICE_NAME || "prepair-member-service",
        environment: process.env.NODE_ENV || "development",
      }),
      formatters: {
        level: (label: string) => {
          // level을 대문자로 변환 (INFO, ERROR, WARN, DEBUG)
          return { level: label.toUpperCase() };
        },
        bindings: () => ({}), // pid, hostname 제거
        log: (object: any) => {
          // correlationId가 있으면 포함
          const { req, res, err, context, ...rest } = object;

          const formatted: any = {
            ...rest,
            ...(context && { module: context }), // NestJS Logger context를 module로 매핑
          };

          // 에러가 있으면 구조화
          if (err) {
            formatted.error = {
              type: err.name || "Error",
              message: err.message,
              ...(err.stack && isDevelopment && { stack: err.stack }),
            };
          }

          return formatted;
        },
      },
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
};
