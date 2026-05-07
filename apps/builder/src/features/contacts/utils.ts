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
