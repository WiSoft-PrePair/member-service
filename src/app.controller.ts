import { Controller, Get } from "@nestjs/common";

@Controller()
export class AppController {
  @Get("health")
  healthCheck(): { status: "ok" } {
    return {
      status: "ok",
    };
  }
}
