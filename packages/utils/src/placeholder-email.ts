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
 * otherwise substitutes the placeholder (left unverified). Facebook limited
 * login returns `sub` instead of `id`, so either stable identifier is accepted.
 * Without one better-auth rejects the profile (`unable_to_get_user_info`), so no
 * shared `fb-undefined@…` row can appear.
 */
export function mapFacebookProfileToUser(profile: {
  id?: string | null
  sub?: string | null
  email?: string | null
}) {
  const facebookId = profile.id ?? profile.sub
  if (profile.email || !facebookId) {
    return {}
  }
  return {
    email: facebookPlaceholderEmail(facebookId),
    emailVerified: false,
  }
}
