import { VerificationCode } from "@/bounded-context/member/domain/member/value-objects";

describe("VerificationCode", () => {
  it("4자리 숫자 생성", () => {
    const code: VerificationCode = VerificationCode.generate();

    expect(code.code).toMatch(/^\d{4}$/);
  });

  it("5분 후 만료", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const code: VerificationCode = VerificationCode.generate(now);

    expect(code.isExpired(new Date("2026-01-01T00:04:59Z"))).toBe(false);
    expect(code.isExpired(new Date("2026-01-01T00:05:00Z"))).toBe(true);
  });

  it("matches는 미만료+일치 모두 검사", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const code: VerificationCode = VerificationCode.of(
      "1234",
      new Date("2026-01-01T00:05:00Z"),
    );

    expect(code.matches("1234", now)).toBe(true);
    expect(code.matches("9999", now)).toBe(false);
    expect(code.matches("1234", new Date("2026-01-01T00:06:00Z"))).toBe(false);
  });
});
