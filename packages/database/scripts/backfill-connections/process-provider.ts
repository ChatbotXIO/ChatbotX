import { and, eq, inArray } from "drizzle-orm"
import type { DatabaseClient } from "../../src/client"
import type { IntegrationType } from "../../src/partials"
import { connectionModel, workspaceModel } from "../../src/schema"
import { CHANNEL_FETCHERS } from "./channel-fetchers"
import { INTEGRATION_FETCHERS } from "./integration-fetchers"
import { loadConnectionsByFk } from "./status"
import {
  BATCH_SIZE,
  type BackfillConflict,
  type BatchFetcher,
  type Candidate,
  type ProviderStat,
  SAMPLE_SIZE,
} from "./types"

export const ALL_HANDLED_PROVIDERS: IntegrationType[] = [
  ...(Object.keys(CHANNEL_FETCHERS) as IntegrationType[]),
  ...(Object.keys(INTEGRATION_FETCHERS) as IntegrationType[]),
]

/** Bulk `Workspace.ownerId` lookup — used both for the `--print-owners` CLI report and to attach an `ownerId` to each per-row conflict (see `BackfillConflict`). */
export const resolveOwnerIds = async (
  client: DatabaseClient,
  workspaceIds: Iterable<string>,
): Promise<Map<string, string>> => {
  const ids = [...new Set(workspaceIds)]
  if (ids.length === 0) {
    return new Map()
  }
  const rows = await client
    .select({ id: workspaceModel.id, ownerId: workspaceModel.ownerId })
    .from(workspaceModel)
    .where(inArray(workspaceModel.id, ids))
  return new Map(rows.map((row) => [row.id, row.ownerId]))
}

type ProcessProviderState = {
  stat: ProviderStat
  sample: Candidate[]
  touchedWorkspaceIds: Set<string>
  // `(workspaceId, sourceId)` -> every candidate occurrence that mapped to
  // it, across every batch for this provider — more than one occurrence
  // means those source rows race for the same `(workspaceId, provider,
  // sourceId)` unique key; only the first one in insert order can win it.
  seenKeys: Map<
    string,
    Array<{ inboxId: string | null; integrationId: string | null }>
  >
  // In --dry-run, keys already counted as "would insert" so a duplicate
  // source row spanning two batches isn't double-counted.
  countedKeys: Set<string>
  zaloWorkspacesByOaId: Map<string, Set<string>> | null
  legacyNeedsReauthRows: Array<{
    workspaceId: string
    inboxId: string | null
    integrationId: string | null
  }>
  // A candidate whose Inbox/Integration already owns a Connection row under
  // a DIFFERENT `sourceId` — legacy satellite data drifted since that row
  // was created. Collides on `Connection_inboxId_key` /
  // `Connection_integrationId_key`, not the `(workspaceId, provider,
  // sourceId)` index the insert below targets, so it must be detected up
  // front rather than left to throw.
  existingConnectionConflictRows: Array<{
    workspaceId: string
    inboxId: string | null
    integrationId: string | null
    sourceId: string
    existingSourceId: string
  }>
}

/** Records per-candidate bookkeeping for one fetched batch: sample rows, the `(workspaceId, sourceId)` -> occurrences map used to detect duplicate-key races, the Zalo oaId -> workspaces map, and legacy-heuristic rows — all independent of whether this run is `--dry-run` or a real insert. */
const scanBatchCandidates = (
  candidates: Candidate[],
  state: ProcessProviderState,
): void => {
  for (const candidate of candidates) {
    const key = `${candidate.workspaceId}\u0000${candidate.sourceId}`
    const occurrences = state.seenKeys.get(key) ?? []
    occurrences.push({
      inboxId: candidate.inboxId,
      integrationId: candidate.integrationId,
    })
    state.seenKeys.set(key, occurrences)
    if (candidate.legacyNeedsReauthHeuristic) {
      state.legacyNeedsReauthRows.push({
        workspaceId: candidate.workspaceId,
        inboxId: candidate.inboxId,
        integrationId: candidate.integrationId,
      })
    }
    if (state.zaloWorkspacesByOaId) {
      const workspaces =
        state.zaloWorkspacesByOaId.get(candidate.sourceId) ?? new Set<string>()
      workspaces.add(candidate.workspaceId)
      state.zaloWorkspacesByOaId.set(candidate.sourceId, workspaces)
    }
    if (state.sample.length < SAMPLE_SIZE) {
      state.sample.push(candidate)
    }
  }
}

/** Flags a candidate whose Inbox/Integration already owns a Connection row under a different `sourceId` than this batch computed — legacy satellite data drifted since that row was created (see `ProcessProviderState.existingConnectionConflictRows`). */
const detectExistingConnectionConflicts = async (
  client: DatabaseClient,
  candidates: Candidate[],
  state: ProcessProviderState,
): Promise<void> => {
  const isChannelBatch = candidates[0].kind === "channel"
  const fkIds = candidates
    .map((c) => c.inboxId ?? c.integrationId)
    .filter((v): v is string => v != null)
  const existingByFkMap = await loadConnectionsByFk(
    client,
    fkIds,
    isChannelBatch,
  )
  for (const candidate of candidates) {
    const fk = candidate.inboxId ?? candidate.integrationId
    const existing = fk ? existingByFkMap.get(fk) : undefined
    if (existing && existing.sourceId !== candidate.sourceId) {
      state.existingConnectionConflictRows.push({
        workspaceId: candidate.workspaceId,
        inboxId: candidate.inboxId,
        integrationId: candidate.integrationId,
        sourceId: candidate.sourceId,
        existingSourceId: existing.sourceId,
      })
    }
  }
}

/** `--dry-run`: counts how many candidates in this batch would insert (deduped against both existing `Connection` rows and keys already counted from an earlier batch). Otherwise: bulk `INSERT ... ON CONFLICT DO NOTHING`, one transaction per batch. */
const insertOrCountBatch = async (
  client: DatabaseClient,
  candidates: Candidate[],
  provider: IntegrationType,
  opts: { dryRun: boolean },
  state: ProcessProviderState,
): Promise<void> => {
  if (opts.dryRun) {
    const sourceIds = [...new Set(candidates.map((c) => c.sourceId))]
    const existingRows = await client
      .select({
        workspaceId: connectionModel.workspaceId,
        sourceId: connectionModel.sourceId,
      })
      .from(connectionModel)
      .where(
        and(
          eq(connectionModel.provider, provider),
          inArray(connectionModel.sourceId, sourceIds),
        ),
      )
    const existingKeys = new Set(
      existingRows.map((row) => `${row.workspaceId}\u0000${row.sourceId}`),
    )
    for (const candidate of candidates) {
      const key = `${candidate.workspaceId}\u0000${candidate.sourceId}`
      if (existingKeys.has(key) || state.countedKeys.has(key)) {
        continue
      }
      state.countedKeys.add(key)
      state.stat.inserted += 1
      state.touchedWorkspaceIds.add(candidate.workspaceId)
    }
    return
  }
  await client.transaction(async (batchTx) => {
    const inserted = await batchTx
      .insert(connectionModel)
      .values(
        candidates.map((candidate) => ({
          workspaceId: candidate.workspaceId,
          provider: candidate.provider,
          kind: candidate.kind,
          channel: candidate.channel,
          inboxId: candidate.inboxId,
          integrationId: candidate.integrationId,
          sourceId: candidate.sourceId,
          displayName: candidate.displayName,
          status: candidate.status,
          statusReason: candidate.statusReason,
          authExpiresAt: candidate.authExpiresAt,
          createdBy: null,
          connectedAt: candidate.connectedAt,
          disconnectedAt: candidate.disconnectedAt,
        })),
      )
      // Untargeted: suppresses a conflict on ANY of the table's unique
      // indexes — the `(workspaceId, provider, sourceId)` composite key,
      // but also `Connection_inboxId_key` / `Connection_integrationId_key`
      // — so one colliding row is skipped rather than throwing and
      // rolling back every other legitimate insert in the same batch.
      .onConflictDoNothing()
      .returning({
        id: connectionModel.id,
        workspaceId: connectionModel.workspaceId,
      })
    state.stat.inserted += inserted.length
    for (const row of inserted) {
      state.touchedWorkspaceIds.add(row.workspaceId)
    }
  })
}

/** Converts the per-provider bookkeeping collected while scanning every batch into the final `BackfillConflict[]` to report. */
const buildConflicts = (
  provider: IntegrationType,
  state: ProcessProviderState,
  duplicateKeyEntries: [
    string,
    Array<{ inboxId: string | null; integrationId: string | null }>,
  ][],
  ownerIdByWorkspace: Map<string, string>,
): BackfillConflict[] => {
  const conflicts: BackfillConflict[] = []
  for (const [key, occurrences] of duplicateKeyEntries) {
    const [workspaceId, sourceId] = key.split("\u0000")
    for (const occurrence of occurrences) {
      conflicts.push({
        kind: "duplicate_source_inbox",
        provider,
        workspaceId,
        ownerId: ownerIdByWorkspace.get(workspaceId),
        inboxId: occurrence.inboxId,
        integrationId: occurrence.integrationId,
        sourceId,
        detail: `${occurrences.length} source rows in workspace ${workspaceId} map to the same (provider=${provider}, sourceId=${sourceId}) Connection key; only one can win the unique constraint — the rest are skipped by ON CONFLICT DO NOTHING.`,
      })
    }
  }
  if (state.zaloWorkspacesByOaId) {
    for (const [oaId, workspaces] of state.zaloWorkspacesByOaId) {
      if (workspaces.size > 1) {
        conflicts.push({
          kind: "duplicate_zalo_oaid",
          provider: "zalo",
          sourceId: oaId,
          detail: `Zalo oaId ${oaId} is connected from ${workspaces.size} different workspaces (${[...workspaces].join(", ")}) — IntegrationZalo has no unique constraint on oaId, unlike every other channel's identity column.`,
        })
      }
    }
  }
  for (const row of state.legacyNeedsReauthRows) {
    conflicts.push({
      kind: "legacy_needs_reauth_heuristic",
      provider,
      workspaceId: row.workspaceId,
      ownerId: ownerIdByWorkspace.get(row.workspaceId),
      inboxId: row.inboxId,
      integrationId: row.integrationId,
      detail: `Inbox.disconnectReason = NULL (rather than the explicit 'token_revoked' value) for this ${provider} candidate. Heuristic: a NULL reason on a disconnected inbox most likely came from a legacy disconnect/markOffline call that predates reason-recording, so it is mapped to needs_reauth/token_revoked like an explicit token_revoked row — but the original cause can't be verified from the data alone.`,
    })
  }
  for (const row of state.existingConnectionConflictRows) {
    conflicts.push({
      kind: "existing_connection_conflict",
      provider,
      workspaceId: row.workspaceId,
      ownerId: ownerIdByWorkspace.get(row.workspaceId),
      inboxId: row.inboxId,
      integrationId: row.integrationId,
      sourceId: row.sourceId,
      detail: `A Connection row already exists for this ${row.inboxId ? "inboxId" : "integrationId"} with sourceId "${row.existingSourceId}", but the current source data now says "${row.sourceId}". Not overwritten — review and reconcile manually.`,
    })
  }
  return conflicts
}

export const processProvider = async (
  client: DatabaseClient,
  provider: IntegrationType,
  fetcher: BatchFetcher,
  opts: { workspaceId?: string; dryRun: boolean },
): Promise<{
  stat: ProviderStat
  conflicts: BackfillConflict[]
  sample: Candidate[]
  touchedWorkspaceIds: Set<string>
}> => {
  const state: ProcessProviderState = {
    stat: { provider, scanned: 0, inserted: 0 },
    sample: [],
    touchedWorkspaceIds: new Set(),
    seenKeys: new Map(),
    countedKeys: new Set(),
    zaloWorkspacesByOaId: provider === "zalo" ? new Map() : null,
    legacyNeedsReauthRows: [],
    existingConnectionConflictRows: [],
  }
  let cursor: string | null = null

  for (;;) {
    const { candidates, nextCursor } = await fetcher(client, {
      workspaceId: opts.workspaceId,
      cursor,
      limit: BATCH_SIZE,
    })
    if (candidates.length === 0) {
      break
    }
    state.stat.scanned += candidates.length

    scanBatchCandidates(candidates, state)
    await detectExistingConnectionConflicts(client, candidates, state)
    await insertOrCountBatch(client, candidates, provider, opts, state)

    if (!nextCursor) {
      break
    }
    cursor = nextCursor
  }

  const duplicateKeyEntries = [...state.seenKeys.entries()].filter(
    ([, occurrences]) => occurrences.length > 1,
  )
  const conflictWorkspaceIds = new Set<string>([
    ...state.legacyNeedsReauthRows.map((row) => row.workspaceId),
    ...duplicateKeyEntries.map(([key]) => key.split("\u0000")[0]),
    ...state.existingConnectionConflictRows.map((row) => row.workspaceId),
  ])
  const ownerIdByWorkspace = await resolveOwnerIds(client, conflictWorkspaceIds)
  const conflicts = buildConflicts(
    provider,
    state,
    duplicateKeyEntries,
    ownerIdByWorkspace,
  )

  return {
    stat: state.stat,
    conflicts,
    sample: state.sample,
    touchedWorkspaceIds: state.touchedWorkspaceIds,
  }
}
