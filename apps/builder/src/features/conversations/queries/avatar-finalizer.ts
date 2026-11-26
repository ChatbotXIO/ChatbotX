import { resolveTenantSettings } from "@chatbotx.io/business"
import { toPublicStorageUrl } from "@chatbotx.io/business/utils"

export type AvatarFinalizer = (key: string) => string

/**
 * How a conversation's contact avatar leaves the server. The builder UI keeps
 * the stored storage key and resolves it in the browser; the public API (the
 * mobile app, CLI, MCP) has no client-side resolver, so `publicUrls: true`
 * turns the key into its absolute URL — the same rule `contacts.list` applies.
 * The tenant's storage URL is read once per call, not once per row.
 */
export async function createAvatarFinalizer(
  workspaceId: string,
  options: { publicUrls?: boolean } = {},
): Promise<AvatarFinalizer> {
  if (!options.publicUrls) {
    return (key) => key
  }
  const { storageUrl } = await resolveTenantSettings({ workspaceId })
  return (key) => toPublicStorageUrl(key, storageUrl)
}
