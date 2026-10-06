import { db } from "../../src/client"
import type { IntegrationType } from "../../src/partials"
import { integrationTypes } from "../../src/partials"
import { backfillConnections } from "./index"
import type {
  BackfillConnectionsOptions,
  BackfillConnectionsResult,
} from "./types"
import { SAMPLE_SIZE } from "./types"

export const parseArgs = (argv: string[]): BackfillConnectionsOptions => {
  const dryRun = argv.includes("--dry-run")
  const verify = argv.includes("--verify")
  const providerArg = argv
    .find((arg) => arg.startsWith("--provider="))
    ?.slice("--provider=".length)
  const workspaceArg = argv
    .find((arg) => arg.startsWith("--workspace="))
    ?.slice("--workspace=".length)
  if (providerArg && !integrationTypes.safeParse(providerArg).success) {
    throw new Error(
      `Unknown --provider value "${providerArg}". Valid values: ${integrationTypes.options.join(", ")}`,
    )
  }
  return {
    dryRun,
    verify,
    provider: providerArg as IntegrationType | undefined,
    workspaceId: workspaceArg,
  }
}

export const printResult = (
  result: BackfillConnectionsResult,
  printOptions: { printOwners?: boolean } = {},
): void => {
  if (result.verify) {
    console.log("Verify results (the first three must be 0):")
    console.log(
      `  Inbox rows missing a Connection row: ${result.verify.channelInboxesMissingConnection}`,
    )
    console.log(
      `  Integration rows missing a Connection row: ${result.verify.integrationsMissingConnection}`,
    )
    console.log(
      `  Connection rows with a status mismatch: ${result.verify.statusMismatches}`,
    )
    console.log(
      `  (informational, not counted above) Inbox rows with NO satellite row at all: ${result.verify.channelInboxesWithNoSatellite}`,
    )
    return
  }

  console.log(
    `Backfill ${result.dryRun ? "(dry run, no writes)" : ""} — per-provider counts:`,
  )
  for (const stat of result.counts) {
    console.log(
      `  ${stat.provider}: scanned=${stat.scanned} ${result.dryRun ? "would-insert" : "inserted"}=${stat.inserted}`,
    )
  }
  console.log(
    `Total ${result.dryRun ? "would-insert" : "inserted"}: ${result.totalInserted}`,
  )

  if (result.conflicts.length > 0) {
    console.log(
      `\nConflicts (${result.conflicts.length}) — reported, not auto-fixed:`,
    )
    for (const conflict of result.conflicts) {
      const workspacePart = conflict.workspaceId
        ? ` workspace=${conflict.workspaceId}`
        : ""
      const ownerPart = conflict.ownerId ? ` owner=${conflict.ownerId}` : ""
      const inboxPart = conflict.inboxId ? ` inboxId=${conflict.inboxId}` : ""
      const integrationPart = conflict.integrationId
        ? ` integrationId=${conflict.integrationId}`
        : ""
      const sourcePart = conflict.sourceId
        ? ` sourceId=${conflict.sourceId}`
        : ""
      console.log(
        `  [${conflict.kind}] ${conflict.provider}${workspacePart}${ownerPart}${inboxPart}${integrationPart}${sourcePart}: ${conflict.detail}`,
      )
    }
  }

  if (result.dryRun && result.sample.length > 0) {
    console.log(`\nSample candidates (up to ${SAMPLE_SIZE}):`)
    for (const candidate of result.sample) {
      console.log(`  ${JSON.stringify(candidate)}`)
    }
  }

  if (printOptions.printOwners) {
    console.log(
      `\nAffected owners (${result.affectedOwnerIds.length}) — run syncUserQuota/reconcileOwnerPoolUsage for each (see module doc):`,
    )
    for (const ownerId of result.affectedOwnerIds) {
      console.log(`  ${ownerId}`)
    }
  }
}

export const main = async (): Promise<void> => {
  const argv = process.argv.slice(2)
  const options = parseArgs(argv)
  const result = await backfillConnections(db, options)
  printResult(result, { printOwners: argv.includes("--print-owners") })
}
