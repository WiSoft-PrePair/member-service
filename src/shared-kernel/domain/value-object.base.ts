export abstract class ValueObject<V extends object> {
  protected readonly value: V;

  protected constructor(value: V) {
    this.value = Object.freeze({ ...value });
  }

  public equals(other?: ValueObject<V>): boolean {
    if (!other) {
      return false;
    }

    return JSON.stringify(this.value) === JSON.stringify(other.value);
  }
}
