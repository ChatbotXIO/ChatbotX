type ContactNameSource = {
  fullName?: string | null
  email?: string | null
  phoneNumber?: string | null
}

/**
 * The first non-blank of name, email and phone; null when the contact has
 * none, so the caller shows its translated "Unknown contact".
 */
export function contactDisplayName(
  contact: ContactNameSource | null | undefined,
): string | null {
  for (const value of [
    contact?.fullName,
    contact?.email,
    contact?.phoneNumber,
  ]) {
    const trimmed = value?.trim()
    if (trimmed) {
      return trimmed
    }
  }
  return null
}
