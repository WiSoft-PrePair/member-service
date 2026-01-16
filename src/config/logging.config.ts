import { Params } from "nestjs-pino";

const isProduction =
  process.env.NODE_ENV === "prod" || process.env.NODE_ENV === "production";

export const loggingConfig: Params = {
  pinoHttp: {
    level: process.env.LOG_LEVEL || "info",
    messageKey: "message",
    transport: !isProduction
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
    }),
    formatters: {
      level: (label: string) => {
        return { level: label.toUpperCase() };
      },
      bindings: () => ({}),
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
