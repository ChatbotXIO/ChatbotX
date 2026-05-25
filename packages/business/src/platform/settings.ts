import type { DatabaseClient } from "@chatbotx.io/database/client"
import type { PlatformSettingModel } from "@chatbotx.io/database/types"
import { customDomainService } from "../enterprise/custom-domain/service"
import { platformSettingService } from "../enterprise/platform-setting/service"
import { integrationContextEnv } from "../integration-context/keys"
import { isCloud, isEnterprise } from "../keys"
import { workspaceService } from "../workspace/service"
import { deriveUrls } from "./derive-urls"

export type EmailTemplate = { subject?: string; body?: string }

export type PlatformSettings = {
  appUrl: string
  wsUrl: string
  storageUrl: string
  name: string
  logoLightUrl: string
  logoDarkUrl: string
  faviconUrl: string
  theme: string | null
  customJS: string | null
  customCSS: string | null
  policyUrl: string | null
  termsOfServiceUrl: string | null
  signupEmailTemplate: EmailTemplate | null
  forgotPasswordEmailTemplate: EmailTemplate | null
  magicLinkEmailTemplate: EmailTemplate | null
}

const getDefaultSettings = (): PlatformSettings => {
  const env = integrationContextEnv()
  const derived = deriveUrls(env.NEXT_PUBLIC_BUILDER_URL)
  return {
    appUrl: derived.appUrl,
    wsUrl: derived.wsUrl,
    storageUrl: derived.storageUrl,
    name: "ChatbotX",
    logoLightUrl: `${derived.appUrl}/brand/logo_white.svg`,
    logoDarkUrl: `${derived.appUrl}/brand/logo_black.svg`,
    faviconUrl: `${derived.appUrl}/brand/icon_black.svg`,
    theme: null,
    customJS: null,
    customCSS: null,
    policyUrl: `${derived.appUrl}/privacy-policy`,
    termsOfServiceUrl: `${derived.appUrl}/terms-of-service`,
    signupEmailTemplate: null,
    forgotPasswordEmailTemplate: null,
    magicLinkEmailTemplate: null,
  }
}

const applyPlatformSetting = (
  defaults: PlatformSettings,
  setting: PlatformSettingModel | null | undefined,
): PlatformSettings => {
  if (!setting) {
    return defaults
  }
  return {
    ...defaults,
    name: setting.brandName ?? defaults.name,
    logoLightUrl: setting.logoLightPath
      ? new URL(setting.logoLightPath, defaults.storageUrl).toString()
      : defaults.logoLightUrl,
    logoDarkUrl: setting.logoDarkPath
      ? new URL(setting.logoDarkPath, defaults.storageUrl).toString()
      : defaults.logoDarkUrl,
    faviconUrl: setting.faviconPath
      ? new URL(setting.faviconPath, defaults.storageUrl).toString()
      : defaults.faviconUrl,
    theme: setting.theme ?? null,
    // customJs and customCSS are gated to Enterprise/Cloud only
    customJS: isEnterprise() || isCloud() ? (setting.customJs ?? null) : null,
    customCSS: isEnterprise() || isCloud() ? (setting.customCss ?? null) : null,
    policyUrl: setting.policyUrl ?? defaults.policyUrl,
    termsOfServiceUrl: setting.termsOfServiceUrl ?? defaults.termsOfServiceUrl,
    signupEmailTemplate: setting.signupEmailTemplate,
    forgotPasswordEmailTemplate: setting.forgotPasswordEmailTemplate,
    magicLinkEmailTemplate: setting.magicLinkEmailTemplate,
  }
}

/**
 * Resolve the public-facing platform settings for a workspace.
 * On community edition, returns env-based defaults merged with any
 * PlatformSetting row found for the workspace owner.
 * On enterprise/cloud, also applies CustomDomain URL overrides via
 * the private enterprise source.
 */
export const resolvePlatformSettings = async (args: {
  workspaceId: string
  tx?: DatabaseClient
}): Promise<PlatformSettings> => {
  const defaults = getDefaultSettings()

  const workspace = await workspaceService.findById({
    id: args.workspaceId,
    tx: args.tx,
  })
  const setting = await platformSettingService.findForUser(workspace.ownerId)

  if (!setting?.isEnabled) {
    return defaults
  }

  return applyPlatformSetting(defaults, setting)
}

/**
 * Resolve the `REALTIME_BROADCAST_SECRET` for a workspace.
 * Returns the global env var (per-user secrets are an enterprise concern).
 */
export const resolveBroadcastSecret = (_args: {
  workspaceId: string
}): string => integrationContextEnv().REALTIME_BROADCAST_SECRET

/**
 * Resolve platform settings by request hostname (from the `x-domain` header
 * set by the builder proxy). On enterprise/cloud, looks up the CustomDomain
 * record to find the user's PlatformSetting. On community, returns env defaults.
 */
export const resolvePlatformSettingsByDomain = async (
  domain: string | null | undefined,
): Promise<PlatformSettings> => {
  const defaults = getDefaultSettings()

  if (!(domain && (isEnterprise() || isCloud()))) {
    return defaults
  }

  const customDomain = await customDomainService.findActiveByDomain(domain)
  if (!customDomain) {
    return defaults
  }

  const setting = await platformSettingService.findForUser(customDomain.userId)
  return applyPlatformSetting(defaults, setting)
}
