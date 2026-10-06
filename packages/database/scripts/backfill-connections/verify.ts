import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  type SQL,
  sql,
} from "drizzle-orm"
import type { PgTable } from "drizzle-orm/pg-core"
import type { DatabaseClient } from "../../src/client"
import type { ChannelType, IntegrationType } from "../../src/partials"
import {
  connectionModel,
  inboxModel,
  integrationModel,
  workspaceModel,
} from "../../src/schema"
import {
  CHANNEL_FETCHERS,
  CHANNEL_SATELLITE_TABLE,
  PROVIDER_CHANNEL,
} from "./channel-fetchers"
import { INTEGRATION_FETCHERS } from "./integration-fetchers"
import { ALL_HANDLED_PROVIDERS } from "./process-provider"
import { connectionAgreesWithCandidate, loadConnectionsByFk } from "./status"
import { BATCH_SIZE, type VerifyCounts } from "./types"

/** The two independent per-channel-type counts (missing-connection, no-satellite-at-all) run concurrently — neither depends on the other. */
const countChannelType = async (
  client: DatabaseClient,
  channelType: ChannelType,
  notPurging: SQL | undefined,
  workspaceId: string | undefined,
): Promise<{ missingConnection: number; noSatellite: number }> => {
  const satelliteTable = CHANNEL_SATELLITE_TABLE[channelType]
  if (!satelliteTable) {
    return { missingConnection: 0, noSatellite: 0 }
  }
  const rawSatellite: PgTable = satelliteTable
  const [[missingRow], [noSatelliteRow]] = await Promise.all([
    client
      .select({ count: sql<number>`count(*)::int` })
      .from(inboxModel)
      .innerJoin(rawSatellite, eq(satelliteTable.inboxId, inboxModel.id))
      .innerJoin(workspaceModel, eq(workspaceModel.id, inboxModel.workspaceId))
      .leftJoin(connectionModel, eq(connectionModel.inboxId, inboxModel.id))
      .where(
        and(
          eq(inboxModel.channel, channelType),
          isNull(connectionModel.id),
          notPurging,
          workspaceId ? eq(inboxModel.workspaceId, workspaceId) : undefined,
        ),
      ),
    client
      .select({ count: sql<number>`count(*)::int` })
      .from(inboxModel)
      .leftJoin(rawSatellite, eq(satelliteTable.inboxId, inboxModel.id))
      .innerJoin(workspaceModel, eq(workspaceModel.id, inboxModel.workspaceId))
      .where(
        and(
          eq(inboxModel.channel, channelType),
          isNull(satelliteTable.inboxId),
          notPurging,
          workspaceId ? eq(inboxModel.workspaceId, workspaceId) : undefined,
        ),
      ),
  ])
  return {
    missingConnection: missingRow?.count ?? 0,
    noSatellite: noSatelliteRow?.count ?? 0,
  }
}

const countIntegrationsMissingConnection = async (
  client: DatabaseClient,
  integrationProviders: IntegrationType[],
  notPurging: SQL | undefined,
  workspaceId: string | undefined,
): Promise<number> => {
  if (integrationProviders.length === 0) {
    return 0
  }
  const [row] = await client
    .select({ count: sql<number>`count(*)::int` })
    .from(integrationModel)
    .innerJoin(
      workspaceModel,
      eq(workspaceModel.id, integrationModel.workspaceId),
    )
    .leftJoin(
      connectionModel,
      eq(connectionModel.integrationId, integrationModel.id),
    )
    .where(
      and(
        inArray(integrationModel.integrationType, integrationProviders),
        isNull(connectionModel.id),
        notPurging,
        workspaceId ? eq(integrationModel.workspaceId, workspaceId) : undefined,
      ),
    )
  return row?.count ?? 0
}

const loadPurgingWorkspaceIds = async (
  client: DatabaseClient,
  workspaceId: string | undefined,
): Promise<Set<string>> => {
  const rows = await client
    .select({ id: workspaceModel.id })
    .from(workspaceModel)
    .where(
      and(
        or(
          isNotNull(workspaceModel.scheduledDeletionAt),
          isNotNull(workspaceModel.purgeStartedAt),
        ),
        workspaceId ? eq(workspaceModel.id, workspaceId) : undefined,
      ),
    )
  return new Set(rows.map((row) => row.id))
}

export const runVerify = async (
  client: DatabaseClient,
  options: { provider?: IntegrationType; workspaceId?: string },
): Promise<VerifyCounts> => {
  const providers = options.provider
    ? [options.provider]
    : ALL_HANDLED_PROVIDERS
  const channelProviders = providers.filter((p) => CHANNEL_FETCHERS[p])
  const integrationProviders = providers.filter((p) => INTEGRATION_FETCHERS[p])
  const handledChannelTypes = [
    ...new Set(channelProviders.map((p) => PROVIDER_CHANNEL[p] as ChannelType)),
  ]
  const notPurging = and(
    isNull(workspaceModel.scheduledDeletionAt),
    isNull(workspaceModel.purgeStartedAt),
  )

  // These three counts are mutually independent — none reads a result the
  // others produce — so they run concurrently rather than as a sequential
  // await-chain.
  const [
    channelCountsByType,
    integrationsMissingConnection,
    purgingWorkspaceIds,
  ] = await Promise.all([
    Promise.all(
      handledChannelTypes.map((channelType) =>
        countChannelType(client, channelType, notPurging, options.workspaceId),
      ),
    ),
    countIntegrationsMissingConnection(
      client,
      integrationProviders,
      notPurging,
      options.workspaceId,
    ),
    loadPurgingWorkspaceIds(client, options.workspaceId),
  ])

  let channelInboxesMissingConnection = 0
  let channelInboxesWithNoSatellite = 0
  for (const counts of channelCountsByType) {
    channelInboxesMissingConnection += counts.missingConnection
    channelInboxesWithNoSatellite += counts.noSatellite
  }

  let statusMismatches = 0
  for (const provider of [...channelProviders, ...integrationProviders]) {
    const fetcher = CHANNEL_FETCHERS[provider] ?? INTEGRATION_FETCHERS[provider]
    if (!fetcher) {
      continue
    }
    let cursor: string | null = null
    for (;;) {
      const { candidates: rawCandidates, nextCursor } = await fetcher(client, {
        workspaceId: options.workspaceId,
        cursor,
        limit: BATCH_SIZE,
      })
      if (rawCandidates.length === 0) {
        break
      }
      const candidates = rawCandidates.filter(
        (c) => !purgingWorkspaceIds.has(c.workspaceId),
      )
      const fkIds = candidates
        .map((c) => c.inboxId ?? c.integrationId)
        .filter((v): v is string => v != null)
      if (fkIds.length > 0) {
        const isChannel = candidates[0].kind === "channel"
        const byFk = await loadConnectionsByFk(client, fkIds, isChannel)
        for (const candidate of candidates) {
          const fk = candidate.inboxId ?? candidate.integrationId
          if (!fk) {
            continue
          }
          const existing = byFk.get(fk)
          if (!existing) {
            // Already surfaced by the missing-connection counts above.
            continue
          }
          if (!connectionAgreesWithCandidate(existing, candidate)) {
            statusMismatches += 1
          }
        }
      }
      if (!nextCursor) {
        break
      }
      cursor = nextCursor
    }
  }

  return {
    channelInboxesMissingConnection,
    integrationsMissingConnection,
    statusMismatches,
    channelInboxesWithNoSatellite,
  }
}
