import { env } from "@/env"
import type { ContactResource } from "./schemas/resource"

export function getAvatarUrl(
  contact?: ContactResource | null,
): string | undefined {
  if (!contact) {
    return
  }

  return contact.avatar
    ? new URL(contact.avatar, env.NEXT_PUBLIC_ASSET_URL).toString()
    : undefined
}

export function getFullName(
  contact?: ContactResource | null | undefined,
): string {
  if (!contact) {
    return "-"
  }

  if (contact.firstName || contact.lastName) {
    return [contact.firstName, contact.lastName]
      .filter((v) => Boolean(v))
      .join(" ")
  }

  return contact.phoneNumber || "-"
}
