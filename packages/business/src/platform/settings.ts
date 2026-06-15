import type { DatabaseClient } from "@chatbotx.io/database/client"
import type { TenantModel } from "@chatbotx.io/database/types"
import { customDomainService } from "../enterprise/custom-domain/service"
import { tenantService } from "../enterprise/tenant/service"
import { integrationContextEnv } from "../integration-context/keys"
import { isCloud, isEnterprise } from "../keys"
import { workspaceService } from "../workspace/service"
import { deriveUrls } from "./derive-urls"

export type EmailTemplate = { subject?: string; body?: string }

export type TenantSettings = {
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

const getDefaultSettings = (): TenantSettings => {
  const env = integrationContextEnv()
  const derived = deriveUrls(
    env.NEXT_PUBLIC_BUILDER_URL,
    env.NEXT_PUBLIC_STORAGE_URL,
  )
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

const applyTenantSetting = (
  defaults: TenantSettings,
  setting: TenantModel | null | undefined,
): TenantSettings => {
  if (!setting) {
    return defaults
  }
  const storageUrl = setting.storageUrl ?? defaults.storageUrl
  return {
    ...defaults,
    storageUrl,
    name: setting.brandName ?? defaults.name,
    logoLightUrl: setting.logoLightPath
      ? new URL(setting.logoLightPath, storageUrl).toString()
      : defaults.logoLightUrl,
    logoDarkUrl: setting.logoDarkPath
      ? new URL(setting.logoDarkPath, storageUrl).toString()
      : defaults.logoDarkUrl,
    faviconUrl: setting.faviconPath
      ? new URL(setting.faviconPath, storageUrl).toString()
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
 * Resolve the public-facing tenant settings for a workspace.
 * Merges env-based defaults with the workspace's `Tenant` branding. The root
 * tenant carries null branding, so platform workspaces fall back to defaults.
 * A non-active tenant (suspended) also falls back to defaults.
 */
export const resolveTenantSettings = async (args: {
  workspaceId: string
  tx?: DatabaseClient
}): Promise<TenantSettings> => {
  const defaults = getDefaultSettings()

  const workspace = await workspaceService.findById({
    id: args.workspaceId,
    tx: args.tx,
  })
  const tenant = await tenantService.findById(workspace.tenantId)

  if (!tenant?.status || tenant.status !== "active") {
    return defaults
  }

  return applyTenantSetting(defaults, tenant)
}

/**
 * Resolve the `REALTIME_BROADCAST_SECRET` for a workspace.
 * Returns the global env var (per-user secrets are an enterprise concern).
 */
export const resolveBroadcastSecret = (_args: {
  workspaceId: string
}): string => integrationContextEnv().REALTIME_BROADCAST_SECRET

/**
 * Resolve tenant settings by request hostname (from the `x-domain` header set by
 * the builder proxy). On enterprise/cloud, maps the active CustomDomain to its
 * `Tenant` and applies that tenant's branding. On community, returns env defaults.
 */
export const resolveTenantSettingsByDomain = async (
  domain: string | null | undefined,
): Promise<TenantSettings> => {
  const defaults = getDefaultSettings()

  if (!(domain && (isEnterprise() || isCloud()))) {
    return defaults
  }

  const customDomain = await customDomainService.findActiveByDomain(domain)
  if (!customDomain) {
    return defaults
  }

  const tenant = await tenantService.findById(customDomain.tenantId)
  if (!tenant?.status || tenant.status !== "active") {
    return defaults
  }
  return applyTenantSetting(defaults, tenant)
}
