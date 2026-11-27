/** A loose email matcher: finds an address inside free text, does not validate it. */
export const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/

/** The first email address written in `text`, as typed, or `null` when there is none. */
export const findEmail = (text: string): string | null =>
  text.match(EMAIL_REGEX)?.[0] ?? null
