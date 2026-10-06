import "server-only"

import {
  type BuildContextIntegrationRow,
  buildContext,
  resolveTenantSettings,
  workspaceService,
} from "@chatbotx.io/business"
import type { ChannelType } from "@chatbotx.io/database/partials"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import type { AuthValue, Context } from "@chatbotx.io/sdk"
import {
  BRANDING_TITLE,
  getBrandingUrl,
} from "@/features/integration-webchat/lib"
import { updateWorkspaceLogo } from "@/features/workspaces/actions/upload-logo"
import { logger } from "@/lib/log"

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
  /**
   * Persists the branding entry onto the satellite row's own local
   * `persistentMenus` column after `addBranding`'s live Graph push
   * succeeds — restores the v1.11.0 insert-time-seeded value (dropped when
   * messenger/instagram moved onto the unified connect session, whose
   * `candidateToConfig` has no app-layer `appUrl`/branding context to seed
   * it at insert time). Only called on a successful push, and only the
   * caller knows whether its row already has user-configured menu items to
   * avoid clobbering — gate skips the call there.
   */
  persistBrandingMenu?: (entry: {
    label: string
    type: "url"
    url: string
  }) => Promise<void>
}): Promise<void> {
  const { session, integrationRow, integration, integrationType } = input
  const { workspace, brandingMenuEntry } = session

  const brandingCtx = await buildContext({
    workspaceId: workspace.id,
    integrationType,
    integration: integrationRow,
  })

  const pushBrandingAndPersist = async () => {
    await integration.runChannelHandler("bot", "addBranding", {
      ctx: brandingCtx,
      title: BRANDING_TITLE,
      url: brandingMenuEntry.url,
    })
    await input.persistBrandingMenu?.({
      label: BRANDING_TITLE,
      type: "url",
      url: brandingMenuEntry.url,
    })
  }

  const results = await Promise.allSettled([
    pushBrandingAndPersist(),
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

/**
 * The `workspace`/`appUrl` lookup plus best-effort `runBrandingFollowUps`
 * call repeated identically across Messenger's, Instagram's, and
 * Instagram-via-Facebook's reconnect handlers: seeds the community branding
 * menu entry onto the satellite row, matching each channel's fresh-connect
 * follow-up — a reconnect that reinserted a deleted row would otherwise
 * never get it seeded. A failure here must never fail the whole reconnect,
 * so it's logged and swallowed rather than propagated. Returns `appUrl`
 * since some callers (e.g. Messenger's whitelist-domain refresh) need it
 * for follow-up work after this.
 */
export async function seedReconnectBranding<TAuth extends AuthValue>(input: {
  workspaceId: string
  integrationId: string
  channel: ChannelType
  integrationRow: BuildContextIntegrationRow<TAuth>
  integration: BrandingIntegration<TAuth>
  integrationType: string
  persistBrandingMenu?: (entry: {
    label: string
    type: "url"
    url: string
  }) => Promise<void>
  /** Channel name used in the best-effort failure log, e.g. `"Messenger"`, `"Instagram (via Facebook)"`. */
  logLabel: string
}): Promise<{ appUrl: string }> {
  const [workspace, { appUrl }] = await Promise.all([
    workspaceService.findById({ id: input.workspaceId }),
    resolveTenantSettings({ workspaceId: input.workspaceId }),
  ])

  await runBrandingFollowUps({
    session: {
      workspace,
      brandingMenuEntry: { url: getBrandingUrl(input.channel, appUrl) },
    },
    integrationRow: input.integrationRow,
    integration: input.integration,
    integrationType: input.integrationType,
    persistBrandingMenu: input.persistBrandingMenu,
  }).catch((error) => {
    logger.warn(
      {
        err: error,
        workspaceId: input.workspaceId,
        integrationId: input.integrationId,
      },
      `${input.logLabel} branding follow-up failed during reconnect`,
    )
  })

  return { appUrl }
}
