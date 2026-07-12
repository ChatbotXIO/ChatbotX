export const maskPii = (value: string | null | undefined): string =>
  value ? `${value.slice(0, 4)}*****` : ""
