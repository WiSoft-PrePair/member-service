import { Controller, Get } from "@nestjs/common";

@Controller()
export class AppController {
  @Get("/health")
  healthCheck(): { status: "ok"; timestamp: string } {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }
}
