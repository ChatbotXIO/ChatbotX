import type { DatabaseClient } from "../../src/client"
import type {
  ChannelType,
  ConnectionStatus,
  ConnectionStatusReason,
  IntegrationType,
} from "../../src/partials"

export const BATCH_SIZE = 500
export const SAMPLE_SIZE = 10

export type BackfillConnectionsOptions = {
  dryRun?: boolean
  provider?: IntegrationType
  workspaceId?: string
  verify?: boolean
}

export type Candidate = {
  provider: IntegrationType
  kind: "channel" | "integration"
  channel: ChannelType | null
  workspaceId: string
  inboxId: string | null
  integrationId: string | null
  sourceId: string
  displayName: string
  status: ConnectionStatus
  statusReason: ConnectionStatusReason | null
  disconnectedAt: Date | null
  authExpiresAt: Date | null
  connectedAt: Date
  /** `true` when a `needs_reauth` mapping came from the NULL-reason legacy heuristic (see `scanBatchCandidates` in `process-provider.ts`). */
  legacyNeedsReauthHeuristic: boolean
}

export type ProviderStat = {
  provider: IntegrationType
  scanned: number
  inserted: number
}

export type BackfillConflict = {
  kind:
    | "duplicate_source_inbox"
    | "duplicate_zalo_oaid"
    | "legacy_needs_reauth_heuristic"
    | "existing_connection_conflict"
  provider: IntegrationType
  workspaceId?: string
  /** `Workspace.ownerId` for `workspaceId` — see the module doc's quota note. */
  ownerId?: string
  inboxId?: string | null
  integrationId?: string | null
  sourceId?: string
  detail: string
}

export type VerifyCounts = {
  channelInboxesMissingConnection: number
  integrationsMissingConnection: number
  statusMismatches: number
  /** Informational only, NOT counted in `channelInboxesMissingConnection` above: a channel-type Inbox row with no satellite row at all, so the backfill has nothing to read and can never create a Connection for it. */
  channelInboxesWithNoSatellite: number
}

export type BackfillConnectionsResult = {
  dryRun: boolean
  counts: ProviderStat[]
  totalInserted: number
  conflicts: BackfillConflict[]
  sample: Candidate[]
  verify?: VerifyCounts
  /** Distinct `Workspace.ownerId`s of every workspace that got (or, under `--dry-run`, would get) at least one Connection row this run. Empty for a `--verify` run. */
  affectedOwnerIds: string[]
}

type BatchArgs = {
  workspaceId?: string
  cursor: string | null
  limit: number
}

type BatchResult = { candidates: Candidate[]; nextCursor: string | null }

export type BatchFetcher = (
  client: DatabaseClient,
  args: BatchArgs,
) => Promise<BatchResult>
