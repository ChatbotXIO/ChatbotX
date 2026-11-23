/**
 * Whether the stored email is an address someone gave. A webchat guest is
 * stored with its guest id in the email field (digits, or
 * `<workspaceId>:<uuid>`), which is no address: a real one always has an `@`.
 */
export const hasRealContactEmail = (
  email: string | null | undefined,
): email is string => typeof email === "string" && email.includes("@")
