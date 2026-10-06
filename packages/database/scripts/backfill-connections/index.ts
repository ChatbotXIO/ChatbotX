import type { DatabaseClient } from "../../src/client"
import { integrationTypes } from "../../src/partials"
import { CHANNEL_FETCHERS } from "./channel-fetchers"
import { INTEGRATION_FETCHERS } from "./integration-fetchers"
import {
  ALL_HANDLED_PROVIDERS,
  processProvider,
  resolveOwnerIds,
} from "./process-provider"
import {
  type BackfillConflict,
  type BackfillConnectionsOptions,
  type BackfillConnectionsResult,
  type Candidate,
  type ProviderStat,
  SAMPLE_SIZE,
} from "./types"
import { runVerify } from "./verify"

export type {
  BackfillConnectionsOptions,
  BackfillConnectionsResult,
  Candidate,
} from "./types"

export const backfillConnections = async (
  client: DatabaseClient,
  options: BackfillConnectionsOptions = {},
): Promise<BackfillConnectionsResult> => {
  if (
    options.provider &&
    !integrationTypes.safeParse(options.provider).success
  ) {
    throw new Error(
      `Unknown --provider value "${options.provider}". Valid values: ${integrationTypes.options.join(", ")}`,
    )
  }

  if (options.verify) {
    return {
      dryRun: options.dryRun ?? false,
      counts: [],
      totalInserted: 0,
      conflicts: [],
      sample: [],
      affectedOwnerIds: [],
      verify: await runVerify(client, {
        provider: options.provider,
        workspaceId: options.workspaceId,
      }),
    }
  }

  const dryRun = options.dryRun ?? false
  const providers = options.provider
    ? [options.provider]
    : ALL_HANDLED_PROVIDERS

  const counts: ProviderStat[] = []
  const conflicts: BackfillConflict[] = []
  const sample: Candidate[] = []
  const touchedWorkspaceIds = new Set<string>()

  for (const provider of providers) {
    const fetcher = CHANNEL_FETCHERS[provider] ?? INTEGRATION_FETCHERS[provider]
    if (!fetcher) {
      // Not eligible for backfill (one of `SKIPPED_PROVIDERS`, or an
      // unrecognised string when called programmatically).
      continue
    }
    const result = await processProvider(client, provider, fetcher, {
      workspaceId: options.workspaceId,
      dryRun,
    })
    counts.push(result.stat)
    conflicts.push(...result.conflicts)
    for (const workspaceId of result.touchedWorkspaceIds) {
      touchedWorkspaceIds.add(workspaceId)
    }
    for (const candidate of result.sample) {
      if (sample.length < SAMPLE_SIZE) {
        sample.push(candidate)
      }
    }
  }

  const ownerIdByWorkspace = await resolveOwnerIds(client, touchedWorkspaceIds)

  return {
    dryRun,
    counts,
    totalInserted: counts.reduce((sum, stat) => sum + stat.inserted, 0),
    conflicts,
    sample,
    affectedOwnerIds: [...new Set(ownerIdByWorkspace.values())].sort(),
  }
}
