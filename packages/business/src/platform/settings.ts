import { integrationContextEnv } from "../integration-context/keys"
import { isEnterprise } from "../keys"
import { organizationService } from "../organization/service"
import { resolvePlatformSettingsByOrganization } from "../organization/urls"
import { workspaceService } from "../workspace/service"

export type PlatformSettings = {
  appUrl: string
  realtimeUrl: string
  assetUrl: string
  name: string
  logo: string | null
  theme: string | null
  customJS: string | null
  customCSS: string | null
}

const getDefaultSettings = (): PlatformSettings => {
  const env = integrationContextEnv()
  return {
    appUrl: env.NEXT_PUBLIC_BUILDER_URL,
    realtimeUrl: env.NEXT_PUBLIC_REALTIME_URL,
    assetUrl: env.NEXT_PUBLIC_ASSET_URL,
    name: "ChatbotX",
    logo: null,
    theme: null,
    customJS: null,
    customCSS: null,
  }
}

type ResolvePlatformSettingsArgs =
  | { workspaceId: string }
  | { organizationId: string }

/**
 * Resolve the public-facing URLs (app, realtime, asset) for a workspace or
 * organization.
 * On community edition, returns the global `NEXT_PUBLIC_*` env vars.
 * On enterprise/cloud, uses the per-org `appUrl`/`wsUrl`/`assetUrl`
 * (with `app.<domain>` etc. fallbacks).
 */
export const resolvePlatformSettings = async (
  args: ResolvePlatformSettingsArgs,
): Promise<PlatformSettings> => {
  const defaultSettings = getDefaultSettings()

  const organizationId =
    "organizationId" in args
      ? args.organizationId
      : (await workspaceService.findById({ id: args.workspaceId }))
          .organizationId

  const organization = await organizationService.findById(organizationId)

  if (!isEnterprise()) {
    return {
      ...defaultSettings,
      name: organization.name,
      logo: organization.logo ?? null,
      theme: organization.theme,
      customJS: organization.customJS,
      customCSS: organization.customCSS,
    }
  }

  return resolvePlatformSettingsByOrganization(organization)
}

/**
 * Resolve the `REALTIME_BROADCAST_SECRET` for a workspace or organization.
 * On community edition (and until per-org secrets are wired up), returns the
 * global `REALTIME_BROADCAST_SECRET` env var.
 *
 * TODO: on enterprise/cloud, fetch the per-org broadcast secret from the database.
 */
export const resolveBroadcastSecret = (
  _args: ResolvePlatformSettingsArgs,
): string => integrationContextEnv().REALTIME_BROADCAST_SECRET

/**
 * Like {@link resolvePlatformSettings} but identifies the org by request hostname
 * (typically the `x-domain` header set by the builder proxy). Useful for
 * routes/server actions that don't have a `workspaceId` yet.
 */
export const resolvePlatformSettingsByDomain = async (
  domain: string | null | undefined,
): Promise<PlatformSettings> => {
  const defaultSettings = getDefaultSettings()

  // On enterprise, domain is required to identify the org; without it fall back to defaults.
  // On community/cloud a single org exists, so we still look it up (ignoring domain).
  if (isEnterprise() && !domain) {
    return defaultSettings
  }

  const where = isEnterprise() && domain ? { domain } : {}
  const organization = await organizationService.find({ where })

  if (!organization) {
    return defaultSettings
  }

  if (!isEnterprise()) {
    return {
      ...defaultSettings,
      theme: organization.theme,
      customJS: organization.customJS,
      customCSS: organization.customCSS,
    }
  }

  return resolvePlatformSettingsByOrganization(organization)
}
