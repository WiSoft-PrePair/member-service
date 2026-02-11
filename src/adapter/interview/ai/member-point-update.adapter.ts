import { Injectable, Logger } from "@nestjs/common";
import { MemberPointUpdate } from "@/application/interview/ports";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class MemberPointUpdateAdapter implements MemberPointUpdate {
  private readonly baseUrl: string;
  private readonly logger: Logger = new Logger(MemberPointUpdateAdapter.name);

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.getOrThrow<string>("MEMBER_SERVICE_URL");
  }

  async addPoint(memberId: string, point: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/members/point}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ point }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(
        `Member point update failed: ${response.status} ${response.statusText}`,
      );
    }
  }
}
