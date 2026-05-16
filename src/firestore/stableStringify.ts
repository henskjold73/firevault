function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce(
        (result, key) => {
          result[key] = sortObject((value as Record<string, unknown>)[key]);

          return result;
        },
        {} as Record<string, unknown>,
      );
  }

  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortObject(value), null, 2);
}
