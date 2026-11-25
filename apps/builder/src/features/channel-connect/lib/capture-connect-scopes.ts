import "server-only"

import { publishDestinationService } from "@chatbotx.io/business"
import { logger } from "@/lib/log"

/** The publishing network of an inbox whose scopes a first connect captures. */
type ConnectPublisherKey = "facebook" | "instagram" | "instagramFacebook"

/**
 * The permissions a connect session recorded in the candidate's auth
 * (`metadata.grantedScopes`); `null` when absent or malformed.
 */
export function grantedScopesOfAuth(auth: unknown): string[] | null {
  if (typeof auth !== "object" || auth === null || !("metadata" in auth)) {
    return null
  }
  const { metadata } = auth
  if (typeof metadata !== "object" || metadata === null) {
    return null
  }
  const scopes = "grantedScopes" in metadata ? metadata.grantedScopes : null
  return Array.isArray(scopes) &&
    scopes.every((scope): scope is string => typeof scope === "string")
    ? scopes
    : null
}

/**
 * Stores the permissions of a freshly connected inbox for the publish state.
 * Best effort: the channel is already connected, so a failure is logged and
 * leaves the scopes unknown.
 */
export async function captureConnectScopes(input: {
  grantedScopes: string[] | null
  inboxId: string
  publisherKey: ConnectPublisherKey
  workspaceId: string
}): Promise<void> {
  try {
    await publishDestinationService.captureInboxScopes(input)
  } catch (err) {
    logger.warn(
      { err, inboxId: input.inboxId, workspaceId: input.workspaceId },
      "Failed to capture the publish scopes of a new connection",
    )
  }
}
