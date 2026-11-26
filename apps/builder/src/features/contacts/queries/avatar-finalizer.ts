import { resolveTenantSettings } from "@chatbotx.io/business"
import { toPublicStorageUrl } from "@chatbotx.io/business/utils"

export type AvatarFinalizer = (key: string) => string | Promise<string>

/**
 * How a stored contact avatar key leaves the server, for every contact avatar
 * output (contacts, conversations, broadcasts). The builder UI keeps the
 * storage key and resolves it in the browser; the public API (the mobile app,
 * CLI, MCP) has no client-side resolver, so `publicUrls: true` turns the key
 * into its absolute URL.
 *
 * The tenant's storage URL is read lazily: on the first stored key the
 * finalizer sees, and then once for the whole call — never once per row, and
 * not at all for an empty page or one with only proxied/placeholder avatars.
 */
export function createAvatarFinalizer(
  workspaceId: string,
  options: { publicUrls?: boolean } = {},
): AvatarFinalizer {
  if (!options.publicUrls) {
    return (key) => key
  }
  let storageUrl: Promise<string> | undefined
  return async (key) => {
    storageUrl ??= resolveTenantSettings({ workspaceId }).then(
      (settings) => settings.storageUrl,
    )
    return toPublicStorageUrl(key, await storageUrl)
  }
}
