import { Global, Module } from "@nestjs/common";
import { loggingConfig } from "@/config/logging.config";
import { LoggerModule as PinoLoggerModule } from "nestjs-pino";
import { LOGGER } from "@/adapter/shared/logger/logger.inferface";
import { LoggerService } from "@/adapter/shared/logger/logger.service";

@Global()
@Module({
  imports: [PinoLoggerModule.forRoot(loggingConfig)],
  providers: [
    {
      provide: LOGGER,
      useClass: LoggerService,
    },
  ],
  exports: [LOGGER],
})
export class LoggerModule {}
