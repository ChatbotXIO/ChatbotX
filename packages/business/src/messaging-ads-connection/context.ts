import type { MessagingAdChannel } from "@chatbotx.io/database/partials"
import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import {
  type FacebookAdsAuthValue,
  facebookAdsAuthSchema,
} from "@chatbotx.io/integration-facebook-ads"
import { ChatbotXException } from "../errors"
import { makeAuthStoreForTable } from "../integration-context/auth-store"
import { buildContextWithAuthStore } from "../integration-context/build-context"
import { messagingAdsConnectionService } from "./service"

// Deliberately NOT re-exported here as `facebookAdsIntegration` — `../
// messaging-ads/facebook-ads-context.ts` already re-exports it under that
// name, and both modules are re-exported from the `@chatbotx.io/business`
// barrel; a second same-named re-export would make it ambiguous through the
// barrel. Callers that need the dispatcher import `integration` directly
// from `@chatbotx.io/integration-facebook-ads` (see `./graph-reads.ts`).

const MESSAGING_ADS_CONNECTION_TABLE = "MessagingAdsConnection"

/** Thrown when a box has no connection, an inactive one, or a stored auth blob that failed to decrypt/parse — the box renders its "reconnect needed" state on this (HTTP 409: the request is well-formed, the connection state is what's wrong). */
export class MessagingAdsReconnectRequiredException extends ChatbotXException {
  constructor(message = "This connection needs to be reconnected.") {
    super(message, "messagingAdsReconnectRequired", 409)
  }
}

export type BuildMessagingAdsContextInput = {
  workspaceId: string
  channel: MessagingAdChannel
  integrationId: string
}

/**
 * Resolves the decrypted `IntegrationContext` for ONE channel integration's
 * messaging-ads connection — the per-integration counterpart to
 * `buildFacebookAdsContext` (`../messaging-ads/facebook-ads-context.ts`,
 * which reads the workspace-wide `IntegrationFacebookAds` row instead).
 *
 * Deliberately does NOT go through `buildContext`'s `facebookAds` integration
 * type: `makeAuthStore("facebookAds", ...)` derives the table name
 * `IntegrationFacebookAds` from the channel string, which is the WRONG table
 * for a `MessagingAdsConnection` row (out/plan/ctwa-ctm-ctid-box-merge.md v3
 * correction #4). The auth store here is bound directly to the
 * `MessagingAdsConnection` table via `makeAuthStoreForTable`.
 */
export async function buildMessagingAdsContext(
  input: BuildMessagingAdsContextInput,
) {
  const row = await messagingAdsConnectionService.findForIntegration(input)
  if (row?.status !== "active") {
    throw new MessagingAdsReconnectRequiredException()
  }

  let auth: FacebookAdsAuthValue
  try {
    auth = await encryptUtils.decryptObject(
      encryptedDataSchema.parse(row.auth),
      facebookAdsAuthSchema,
    )
  } catch {
    // A stored auth blob that fails to decode is unrecoverable the same way
    // an expired token is — surface the same "reconnect needed" outcome and
    // flag the connection so the box doesn't keep silently failing.
    await messagingAdsConnectionService.markInvalid(input)
    throw new MessagingAdsReconnectRequiredException()
  }

  const authStore = makeAuthStoreForTable<FacebookAdsAuthValue>(
    MESSAGING_ADS_CONNECTION_TABLE,
    `messagingAds:${input.channel}`,
    { id: row.id },
  )

  return buildContextWithAuthStore({
    workspaceId: input.workspaceId,
    auth,
    authStore,
    integrationDetail: { ...row, auth },
  })
}
