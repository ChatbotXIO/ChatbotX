import "server-only"

import {
  type BuildContextIntegrationRow,
  buildContext,
} from "@chatbotx.io/business"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import type { AuthValue, Context } from "@chatbotx.io/sdk"
import { BRANDING_TITLE } from "@/features/integration-webchat/lib"
import { updateWorkspaceLogo } from "@/features/workspaces/actions/upload-logo"

/** Shared shape every channel's `integration` export satisfies for these two calls. */
type BrandingIntegration<TAuth extends AuthValue> = {
  runChannelHandler(
    group: "bot",
    name: "addBranding",
    props: { ctx: Context<TAuth>; title: string; url: string },
  ): Promise<void>
  runChannelHandler(
    group: "bot",
    name: "getProfilePictureUrl",
    props: { ctx: Context<TAuth> },
  ): Promise<string | undefined>
}

/**
 * The `buildContext → addBranding → updateWorkspaceLogo` sequence repeated
 * identically across Messenger's, Instagram's, and Instagram-via-Facebook's
 * post-connect follow-ups — the only per-channel differences are the
 * `integration` module and the already-auth-cast `integrationRow` passed to
 * `buildContext`. `addBranding` (a live Graph API push) and
 * `updateWorkspaceLogo` (its own Graph API read) are independent of each
 * other once `brandingCtx` exists, so they run concurrently; if either
 * rejects the other still gets to finish before this rethrows, so a logo
 * fetch failure never gets skipped just because the branding push failed
 * (or vice versa).
 */
export async function runBrandingFollowUps<TAuth extends AuthValue>(input: {
  session: { workspace: WorkspaceModel; brandingMenuEntry: { url: string } }
  integrationRow: BuildContextIntegrationRow<TAuth>
  integration: BrandingIntegration<TAuth>
  integrationType: string
}): Promise<void> {
  const { session, integrationRow, integration, integrationType } = input
  const { workspace, brandingMenuEntry } = session

  const brandingCtx = await buildContext({
    workspaceId: workspace.id,
    integrationType,
    integration: integrationRow,
  })

  const results = await Promise.allSettled([
    integration.runChannelHandler("bot", "addBranding", {
      ctx: brandingCtx,
      title: BRANDING_TITLE,
      url: brandingMenuEntry.url,
    }),
    updateWorkspaceLogo({
      id: workspace.id,
      integration,
      ctx: brandingCtx,
    }),
  ])
  const failed = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  )
  if (failed) {
    throw failed.reason
  }
}
