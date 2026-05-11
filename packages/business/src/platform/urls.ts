import { integrationContextEnv } from "../integration-context/keys"
import { isCommunity } from "../keys"
import { organizationService } from "../organization/service"
import { getOrganizationUrls } from "../organization/urls"
import { workspaceService } from "../workspace/service"

export type PlatformUrls = {
  appUrl: string
  realtimeUrl: string
  assetUrl: string
}

const getCommunityUrls = (): PlatformUrls => {
  const env = integrationContextEnv()
  return {
    appUrl: env.NEXT_PUBLIC_BUILDER_URL,
    realtimeUrl: env.NEXT_PUBLIC_REALTIME_URL,
    assetUrl: env.NEXT_PUBLIC_ASSET_URL,
  }
}

type ResolvePlatformUrlsArgs =
  | { workspaceId: string }
  | { organizationId: string }

/**
 * Resolve the public-facing URLs (app, realtime, asset) for a workspace or
 * organization.
 * On community edition, returns the global `NEXT_PUBLIC_*` env vars.
 * On enterprise/cloud, uses the per-org `appUrl`/`wsUrl`/`assetUrl`
 * (with `app.<domain>` etc. fallbacks).
 */
export const resolvePlatformUrls = async (
  args: ResolvePlatformUrlsArgs,
): Promise<PlatformUrls> => {
  if (isCommunity()) {
    return getCommunityUrls()
  }

  const organizationId =
    "organizationId" in args
      ? args.organizationId
      : (await workspaceService.findById(args.workspaceId)).organizationId

  const organization = await organizationService.findById(organizationId)
  const orgUrls = getOrganizationUrls(organization)
  return {
    appUrl: orgUrls.appUrl,
    realtimeUrl: orgUrls.wsUrl,
    assetUrl: orgUrls.assetUrl,
  }
}

/**
 * Resolve the `REALTIME_BROADCAST_SECRET` for a workspace or organization.
 * On community edition (and until per-org secrets are wired up), returns the
 * global `REALTIME_BROADCAST_SECRET` env var.
 *
 * TODO: on enterprise/cloud, fetch the per-org broadcast secret from the database.
 */
export const resolveBroadcastSecret = (
  _args: ResolvePlatformUrlsArgs,
): string => integrationContextEnv().REALTIME_BROADCAST_SECRET

/**
 * Like {@link resolvePlatformUrls} but identifies the org by request hostname
 * (typically the `x-domain` header set by the builder proxy). Useful for
 * routes/server actions that don't have a `workspaceId` yet.
 */
export const resolvePlatformUrlsByDomain = async (
  domain: string | null | undefined,
): Promise<PlatformUrls> => {
  if (isCommunity() || !domain) {
    return getCommunityUrls()
  }

  const organization = await organizationService.findByDomain(domain)
  const orgUrls = getOrganizationUrls(organization)
  return {
    appUrl: orgUrls.appUrl,
    realtimeUrl: orgUrls.wsUrl,
    assetUrl: orgUrls.assetUrl,
  }
}
