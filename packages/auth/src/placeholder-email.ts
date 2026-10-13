/**
 * Facebook accounts registered with only a phone number return no `email`,
 * and better-auth refuses to create a user without one (`email_not_found`).
 * Such users get a stable placeholder derived from their Facebook id instead,
 * so every sign-in resolves to the same `User` row.
 *
 * `.invalid` is reserved (RFC 2606), so a placeholder can never receive mail.
 */
const PLACEHOLDER_EMAIL_DOMAIN = "facebook.placeholder.invalid"

export function facebookPlaceholderEmail(facebookId: string): string {
  return `fb-${facebookId}@${PLACEHOLDER_EMAIL_DOMAIN}`
}

export function isPlaceholderEmail(email: unknown): boolean {
  return (
    typeof email === "string" &&
    email.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`)
  )
}

/**
 * `mapProfileToUser` for the Facebook provider: keeps a real email untouched,
 * otherwise substitutes the placeholder (left unverified). Without an id there
 * is nothing stable to derive from — better-auth rejects that profile anyway
 * (`unable_to_get_user_info`), so no shared `fb-undefined@…` row can appear.
 */
export function mapFacebookProfileToUser(profile: {
  id?: string | null
  email?: string | null
}) {
  if (profile.email || !profile.id) {
    return {}
  }
  return {
    email: facebookPlaceholderEmail(profile.id),
    emailVerified: false,
  }
}
