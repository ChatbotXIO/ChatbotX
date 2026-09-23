// Single source of truth for building public storage URLs — shared with the
// browser (useAvatarUrl) so inbox avatars and server-rendered URLs stay in sync.
import { getPublicFileUrl } from "@chatbotx.io/utils"

export { getPublicFileUrl } from "@chatbotx.io/utils"
export * from "./inbox/utils"

export const HTTP_URL_RE = /^https?:\/\//i

export function toPublicStorageUrl(path: string, baseUrl: string): string
export function toPublicStorageUrl(
  path: null | undefined,
  baseUrl: string,
): null
export function toPublicStorageUrl(
  path: string | null | undefined,
  baseUrl: string,
): string | null
export function toPublicStorageUrl(
  path: string | null | undefined,
  baseUrl: string,
): string | null {
  if (!path) {
    return null
  }
  if (HTTP_URL_RE.test(path)) {
    return path
  }
  return getPublicFileUrl(path, baseUrl)
}
