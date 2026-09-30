export const countMessageCharacters = (
  value: string | null | undefined,
): number => Array.from(value ?? "").length
