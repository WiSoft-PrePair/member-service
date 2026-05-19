import { InvalidPasswordException } from "@/bounded-context/member/domain/member/exceptions";
import { Password } from "@/bounded-context/member/domain/member/value-objects";
import { MockEncoder } from "../mock-encoder";

describe("Password Value Object", () => {
  const encoder = new MockEncoder();

  it("최소 길이를 충족하면 생성", () => {
    expect(Password.create("12345678", encoder).hashed).toBe("hashed_12345678");
  });

  it("8자리 미만이면 예외", () => {
    expect(() => Password.create("short", encoder)).toThrow(
      InvalidPasswordException,
    );
  });

  it("matches는 인코더에 위임", () => {
    const password: Password = Password.create("password123", encoder);

    expect(password.matches("password123", encoder)).toBe(true);
    expect(password.matches("wrong", encoder)).toBe(false);
  });

  it("fromHashed는 검증 없이 복원", () => {
    expect(Password.fromHashed("any-hash").hashed).toBe("any-hash");
  });
});
