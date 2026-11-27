const WHITESPACE = /\s+/

/** Up to two uppercase letters from a display name, for avatar fallbacks. */
export const initials = (label: string) =>
  label
    .split(WHITESPACE)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "?"
