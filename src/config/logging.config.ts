import { Params } from "nestjs-pino";

export const loggingConfig: Params = {
  pinoHttp: {
    level: process.env.LOG_LEVEL || "info",
    transport:
      process.env.NODE_ENV !== "production"
        ? {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "SYS:standard",
              ignore: "pid,hostname",
              singleLine: false,
            },
          }
        : undefined,
    customProps: () => ({
      service: process.env.SERVICE_NAME || "prepair-member-service",
    }),
    formatters: {
      level: (label: string) => {
        return { level: label.toUpperCase() };
      },
      bindings: () => ({}), // pid, hostname 제거
      log: (object: any) => {
        // time -> timestamp로 변경
        if (object.time) {
          object.timestamp = object.time;
          delete object.time;
        }
        return object;
      },
    },
    serializers: {
      req: (req: any) => ({
        method: req.method,
        url: req.url,
        correlationId: req.headers["x-correlation-id"],
      }),
      res: (res: any) => ({
        statusCode: res.statusCode,
      }),
    },
    redact: {
      paths: ["req.headers.authorization", "req.body.password"],
      remove: true,
    },
  },
};
