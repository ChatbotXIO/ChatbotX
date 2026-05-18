import {
  uploader as defaultUploader,
  getStoragePrefix,
} from "@chatbotx.io/filesystem"
import { signRealtimeToken } from "@chatbotx.io/partysocket-config/auth"
import type { AuthStore, AuthValue, Context } from "@chatbotx.io/sdk"
import {
  resolveBroadcastSecret,
  resolvePlatformSettings,
} from "../platform/settings"
import { type AuthStoreIntegrationRow, makeAuthStore } from "./auth-store"

type GetRealtimeAuthHeaders =
  Context<AuthValue>["platform"]["getRealtimeAuthHeaders"]

const buildGetRealtimeAuthHeaders =
  (secret: string): GetRealtimeAuthHeaders =>
  async (target) => {
    const token = await signRealtimeToken(target, secret)
    return { Authorization: `Bearer ${token}` }
  }

export type PlatformData = {
  appUrl: string
  realtimeUrl: string
  getRealtimeAuthHeaders: GetRealtimeAuthHeaders
  assetUrl: string
}

const resolvePlatformData = async (
  workspaceId: string,
): Promise<PlatformData> => {
  const platformSettings = await resolvePlatformSettings({ workspaceId })
  const realtimeSecret = await resolveBroadcastSecret({ workspaceId })

  return {
    ...platformSettings,
    getRealtimeAuthHeaders: buildGetRealtimeAuthHeaders(realtimeSecret),
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
