import {
  uploader as defaultUploader,
  getStoragePrefix,
} from "@chatbotx.io/filesystem"
import { signRealtimeToken } from "@chatbotx.io/partysocket-config/auth"
import type { AuthStore, AuthValue, Context } from "@chatbotx.io/sdk"
import {
  resolveBroadcastSecret,
  resolveTenantSettings,
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
  wsUrl: string
  storageUrl: string
  getRealtimeAuthHeaders: GetRealtimeAuthHeaders
}

const resolvePlatformData = async (
  workspaceId: string,
): Promise<PlatformData> => {
  const [tenantSettings, realtimeSecret] = await Promise.all([
    resolveTenantSettings({ workspaceId }),
    resolveBroadcastSecret({ workspaceId }),
  ])

  return {
    ...tenantSettings,
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
 * Build an {@link IntegrationContext} from an already-constructed
 * {@link AuthStore} instead of deriving one from `integrationType` — for auth
 * tables that don't follow the `Integration<Channel>` naming convention
 * `buildContext` assumes (see `makeAuthStoreForTable` in `./auth-store.ts`).
 * `buildContext` is a thin wrapper over this for the common case.
 */
export async function buildContextWithAuthStore<TAuth extends AuthValue>(args: {
  workspaceId: string
  auth: TAuth
  authStore: AuthStore<TAuth>
  integrationDetail: Record<string, unknown>
}): Promise<IntegrationContext<TAuth>> {
  const platformData = await resolvePlatformData(args.workspaceId)

  return {
    storagePrefix: getStoragePrefix(args.workspaceId),
    auth: args.auth,
    authStore: args.authStore,
    integrationDetail: args.integrationDetail,
    uploader: defaultUploader,
    platform: platformData,
  }
}

/**
 * Build an {@link IntegrationContext} from an integration row.
 *
 * - `auth`, `id`, and (optionally) `inboxId` are read off the row
 * - `authStore` is auto-wired (load/save/lock + markOffline) from `channel + row.id`
 * - The remaining row fields become `ctx.integrationDetail`
 * - `platformData` are resolved from the user's PlatformCredential on enterprise/cloud
 *   editions, and from `NEXT_PUBLIC_*` env vars on community
 *
 * Used identically from worker handlers and builder server actions.
 */
export function buildContext<TAuth extends AuthValue>(args: {
  workspaceId: string
  integrationType: string
  integration: BuildContextIntegrationRow<TAuth>
}): Promise<IntegrationContext<TAuth>> {
  return buildContextWithAuthStore({
    workspaceId: args.workspaceId,
    auth: args.integration.auth,
    authStore: makeAuthStore<TAuth>(args.integrationType, args.integration),
    integrationDetail: args.integration,
  })
}
