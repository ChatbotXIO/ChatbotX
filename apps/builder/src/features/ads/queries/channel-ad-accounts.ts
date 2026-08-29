import {
  listCachedMessagingAdAccounts,
  messagingAdsConnectionService,
} from "@chatbotx.io/business"
import type { FacebookAdAccount } from "@chatbotx.io/integration-facebook-ads"
import { mapWithConcurrency } from "@chatbotx.io/utils"
import type { AdsEligibleChannelType } from "@chatbotx.io/utils/channel"
import { getCachedAdAccounts } from "@/features/integration-facebook-ads/queries"
import { logger } from "@/lib/log"

// Facebook Graph API enforces per-access-token rate limits; capping the
// per-integration-connection fan-out keeps a channel with many connected
// integrations from bursting past them while resolving "All accounts".
// Mirrors AD_INSIGHTS_FETCH_CONCURRENCY in ./analytics.ts.
const CHANNEL_AD_ACCOUNTS_FETCH_CONCURRENCY = 5

/**
 * Where one ad account in the union came from — INTERNAL to this module and
 * its callers in `apps/builder` (Codex MED-5): the oRPC layer strips this
 * before responding, the UI never needs it. Phase 3 (`analytics.ts`) reads
 * `sources[0]` to route each selected account's spend fetch to the token
 * that can see it.
 */
export type AdAccountSource =
  | { kind: "messaging"; integrationId: string }
  | { kind: "workspace" }

export type ChannelAdAccount = FacebookAdAccount & {
  /** Every source this account was listed under — at least one. Dedup keeps
   * every source (never just the first) so a later consumer can fail over
   * to a second valid token; `sources[0]` is only "first listing source
   * wins" for routing, not a claim that it's the only one. */
  sources: AdAccountSource[]
}

type AccountEntry = { account: FacebookAdAccount; source: AdAccountSource }

function connectionIntegrationId(connection: {
  integrationWhatsappId: string | null
  integrationMessengerId: string | null
  integrationInstagramId: string | null
}): string | null {
  return (
    connection.integrationWhatsappId ??
    connection.integrationMessengerId ??
    connection.integrationInstagramId ??
    null
  )
}

async function listMessagingAccountsForIntegration(input: {
  workspaceId: string
  channel: AdsEligibleChannelType
  integrationId: string
}): Promise<AccountEntry[]> {
  try {
    const accounts = await listCachedMessagingAdAccounts(input)
    const source: AdAccountSource = {
      kind: "messaging",
      integrationId: input.integrationId,
    }
    return accounts.map((account) => ({ account, source }))
  } catch (error) {
    // Every per-source failure is warn + skip — never fails the whole union
    // (a reconnect-needed integration must not blank out every other
    // integration's accounts, or the workspace-wide fallback).
    logger.warn(
      {
        err: error,
        workspaceId: input.workspaceId,
        channel: input.channel,
        integrationId: input.integrationId,
      },
      "Failed to load ad accounts for a channel integration's messaging-ads connection",
    )
    return []
  }
}

async function listWorkspaceWideAccounts(
  workspaceId: string,
): Promise<AccountEntry[]> {
  try {
    const accounts = await getCachedAdAccounts(workspaceId)
    return accounts.map((account) => ({
      account,
      source: { kind: "workspace" as const },
    }))
  } catch (error) {
    // getCachedAdAccounts THROWS when the workspace has no workspace-wide
    // Facebook Ads integration — a very common case now that boxes connect
    // their own tokens, so this is expected, not exceptional.
    logger.warn(
      { err: error, workspaceId },
      "No workspace-wide Facebook Ads account list for the channel ad-account union",
    )
    return []
  }
}

function dedupeById(entries: AccountEntry[]): ChannelAdAccount[] {
  const byId = new Map<string, ChannelAdAccount>()
  for (const { account, source } of entries) {
    const existing = byId.get(account.id)
    if (existing) {
      existing.sources.push(source)
      continue
    }
    byId.set(account.id, { ...account, sources: [source] })
  }
  return [...byId.values()]
}

export type ResolveChannelAdAccountSourcesInput = {
  workspaceId: string
  channel: AdsEligibleChannelType
  integrationId?: string
}

/**
 * The Ads dashboard's channel-wide ad-account union (Codex HIGH-2/plan Phase
 * 1) — lives in the BUILDER feature layer (not `packages/business`) because
 * the workspace-wide leg (`getCachedAdAccounts`) is itself an app-layer
 * query that `packages/business` must not import.
 *
 * - `integrationId` given -> narrows to ONE channel integration's own
 *   messaging-ads connection (its `channel:integrationId` cache is reused,
 *   no extra Graph traffic on a re-render).
 * - Otherwise -> unions every connected integration's messaging-ads
 *   connection for the channel PLUS the workspace-wide `IntegrationFacebookAds`
 *   fallback (legacy compat — Decision #1 in the plan), deduped by
 *   ad-account id. Every source's failure is isolated (warn + skip); the
 *   union never fails wholesale because one token needs reconnecting.
 */
export async function resolveChannelAdAccountSources(
  input: ResolveChannelAdAccountSourcesInput,
): Promise<ChannelAdAccount[]> {
  // BOTH branches resolve the workspace's ACTIVE connections first.
  // The narrowed branch must not go straight to the cached account list:
  // `listCachedMessagingAdAccounts` keys Redis by `channel:integrationId`
  // only, so a warm cache would serve a FOREIGN workspace's integrationId
  // (cross-workspace read) or an `invalid` connection's stale list. Checking
  // membership in this workspace-scoped, active-only list closes both.
  const connections = await messagingAdsConnectionService.listForChannel({
    workspaceId: input.workspaceId,
    channel: input.channel,
  })

  if (input.integrationId) {
    const ownsRequestedIntegration = connections.some(
      (connection) =>
        connectionIntegrationId(connection) === input.integrationId,
    )
    if (!ownsRequestedIntegration) {
      return []
    }
    const entries = await listMessagingAccountsForIntegration({
      workspaceId: input.workspaceId,
      channel: input.channel,
      integrationId: input.integrationId,
    })
    return dedupeById(entries)
  }

  const [connectionResults, workspaceEntries] = await Promise.all([
    mapWithConcurrency(
      connections,
      CHANNEL_AD_ACCOUNTS_FETCH_CONCURRENCY,
      (connection) => {
        const integrationId = connectionIntegrationId(connection)
        if (!integrationId) {
          return Promise.resolve<AccountEntry[]>([])
        }
        return listMessagingAccountsForIntegration({
          workspaceId: input.workspaceId,
          channel: input.channel,
          integrationId,
        })
      },
    ),
    listWorkspaceWideAccounts(input.workspaceId),
  ])

  const messagingEntries = connectionResults.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  )

  return dedupeById([...messagingEntries, ...workspaceEntries])
}
