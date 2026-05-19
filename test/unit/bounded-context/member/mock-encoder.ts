export class MockEncoder {
  encode(p: string): string {
    return `hashed_${p}`;
  }

  matches(p: string, h: string): boolean {
    return h === `hashed_${p}`;
  }
}
