import "server-only"

import {
  facebookMarketingMessagesService,
  platformCredentialService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import {
  debugToken,
  hasMarketingMessages,
  toAppAccessToken,
} from "@chatbotx.io/integration-messenger/apis/auth"
import { getTranslations } from "next-intl/server"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"

export type MarketingMessagesGrant =
  | { state: "missing" }
  | { state: "expired" }
  | {
      state: "valid"
      accessToken: string
      version?: string
      facebookUserId: string | null
    }

/**
 * The workspace's Marketing Messages grant, in the three states the UI cares
 * about.
 *
 * `is_valid` is checked alongside the scopes: Facebook answers HTTP 200 with a
 * populated `scopes` array for tokens that have since expired or been revoked,
 * so scopes alone would report a dead grant as usable and hide the re-grant
 * prompt — the same trap documented on `isTokenLeadEligible`.
 *
 * Every failure path degrades to `expired` rather than throwing: a rotated
 * encryption key or a Graph outage must render the re-grant panel, not a 500.
 */
export async function resolveMarketingMessagesGrant(
  workspace: WorkspaceModel,
): Promise<MarketingMessagesGrant> {
  const row = await facebookMarketingMessagesService.findAuth(workspace.id)
  if (!row) {
    return { state: "missing" }
  }
  if (row.status === "invalid") {
    return { state: "expired" }
  }
  if (row.tokenExpiresAt && row.tokenExpiresAt.getTime() <= Date.now()) {
    return { state: "expired" }
  }

  const auth = await facebookMarketingMessagesService.decryptAuth(row)
  if (!auth?.accessToken) {
    return { state: "expired" }
  }

  // The app access token must come from the credential resolved for THIS
  // workspace's owner — the app that minted the token. A bare platform default
  // would answer "(#100) The token provided is not for this app" for a
  // reseller-owned grant.
  const credential = await platformCredentialService.resolveForOwner({
    ownerId: await resolveOwnerForWorkspace(workspace),
    type: "messenger",
  })
  if (!credential) {
    return { state: "expired" }
  }

  try {
    const data = await debugToken({
      inputToken: auth.accessToken,
      appAccessToken: toAppAccessToken(credential.config),
      version: auth.version ?? credential.config.version,
    })
    if (data.is_valid === false || !hasMarketingMessages(data.scopes)) {
      await facebookMarketingMessagesService.markAuthInvalid(workspace.id)
      return { state: "expired" }
    }
  } catch {
    // A Graph outage must not hard-fail the page. Do NOT mark invalid here —
    // the token may be perfectly good.
    return { state: "expired" }
  }

  return {
    state: "valid",
    accessToken: auth.accessToken,
    version: auth.version ?? credential.config.version,
    facebookUserId: row.facebookUserId,
  }
}

/** Server-side boundary for the create/update actions (spec D19). */
export async function requireValidGrant(
  workspace: WorkspaceModel,
): Promise<Extract<MarketingMessagesGrant, { state: "valid" }>> {
  const grant = await resolveMarketingMessagesGrant(workspace)
  if (grant.state !== "valid") {
    const t = await getTranslations()
    throw new ChatbotXException(
      t("facebookMarketingMessages.errors.notGranted"),
    )
  }
  return grant
}
