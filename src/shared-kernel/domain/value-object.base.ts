export abstract class ValueObject<V> {
  protected readonly _value: V;

  protected constructor(value: V) {
    this._value = value;
  }

  public equals(other?: ValueObject<V>): boolean {
    if (!other) {
      return false;
    }

    return JSON.stringify(this._value) === JSON.stringify(other.value);
  }

  public get value(): V {
    return this._value;
  }
}
