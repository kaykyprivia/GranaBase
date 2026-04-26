export function coerceMutation<T>(value: T): never {
  return value as never;
}

export function coerceData<T>(value: unknown): T {
  return value as T;
}
