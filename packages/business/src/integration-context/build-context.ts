import {
  uploader as defaultUploader,
  getStoragePrefix,
} from "@chatbotx.io/filesystem"
import type { AuthStore, AuthValue } from "@chatbotx.io/sdk"
import { isCommunity } from "../keys"
import { organizationService } from "../organization/service"
import { getOrganizationUrls } from "../organization/urls"
import { workspaceService } from "../workspace/service"
import { type AuthStoreIntegrationRow, makeAuthStore } from "./auth-store"
import { integrationContextEnv } from "./keys"

export type PlatformData = {
  appUrl: string
  realtimeUrl: string
  realtimeApiKey: string
  assetUrl: string
}

/**
 * Resolve the public-facing URLs to embed in the integration context for the
 * **community** edition. Reads NEXT_PUBLIC_* env vars; both builder (Next.js)
 * and worker (Node.js) runtimes populate these.
 *
 * Non-community editions resolve URLs per-organization via {@link buildContext}.
 */
export const getContextUrls = (): PlatformData => {
  const env = integrationContextEnv()
  return {
    appUrl: env.NEXT_PUBLIC_BUILDER_URL,
    realtimeUrl: env.NEXT_PUBLIC_REALTIME_URL,
    realtimeApiKey: env.REALTIME_API_KEY,
    assetUrl: env.NEXT_PUBLIC_ASSET_URL,
  }
}

const resolvePlatformData = async (
  workspaceId: string,
): Promise<PlatformData> => {
  if (isCommunity()) {
    return getContextUrls()
  }

  const workspace = await workspaceService.findById(workspaceId)
  const organization = await organizationService.findById(
    workspace.organizationId,
  )
  const orgUrls = getOrganizationUrls(organization)
  const env = integrationContextEnv()

  return {
    appUrl: orgUrls.appUrl,
    realtimeUrl: orgUrls.wsUrl,
    realtimeApiKey: env.REALTIME_API_KEY,
    assetUrl: orgUrls.assetUrl,
  }
}

export type IntegrationContext<TAuth extends AuthValue = AuthValue> = {
  storagePrefix: string
  auth: TAuth
  authStore: AuthStore<TAuth>
  integrationDetail: Record<string, unknown>
  uploader: typeof defaultUploader
  platform: PlatformData
}

/**
 * Shape `buildContext` accepts as the integration row — typically a row from
 * the `Integration<Channel>` table (`IntegrationMessengerModel`,
 * `IntegrationZaloModel`, `IntegrationGoogleSheetsModel`, etc.).
 */
export type BuildContextIntegrationRow<TAuth extends AuthValue = AuthValue> =
  AuthStoreIntegrationRow & {
    auth: TAuth
  } & Record<string, unknown>

/**
 * Build an {@link IntegrationContext} from an integration row.
 *
 * - `auth`, `id`, and (optionally) `inboxId` are read off the row
 * - `authStore` is auto-wired (load/save/lock + markOffline) from `channel + row.id`
 * - The remaining row fields become `ctx.integrationDetail`
 * - `platformData` are resolved from the workspace's organization on enterprise/cloud
 *   editions, and from `NEXT_PUBLIC_*` env vars on community
 *
 * Used identically from worker handlers and builder server actions.
 */
export async function buildContext<TAuth extends AuthValue>(args: {
  workspaceId: string
  integrationType: string
  integration: BuildContextIntegrationRow<TAuth>
}): Promise<IntegrationContext<TAuth>> {
  const platformData = await resolvePlatformData(args.workspaceId)

  return {
    storagePrefix: getStoragePrefix(args.workspaceId),
    auth: args.integration.auth,
    authStore: makeAuthStore<TAuth>(args.integrationType, args.integration),
    integrationDetail: args.integration,
    uploader: defaultUploader,
    platform: platformData,
  }
}
