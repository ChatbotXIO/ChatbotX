/**
 * Backfills `Connection.platformCredentialId` for connections made before the
 * pin existed.
 *
 * A connection is pinned only when exactly one candidate credential proves to
 * be the app it was made with: the candidates are the tenant-first owner's own
 * row and the platform row, and a candidate matches when its type is the
 * provider's `credentialType` (from `CONNECTION_REGISTRY`, never assumed from
 * the provider name) and its `clientId` equals the `clientId` stored in the
 * connection's auth. No match, more than one match, or no stored `clientId`
 * (e.g. `facebookAds`, Google Ads developer tokens) leaves the pin null — the
 * reader then keeps the current owner lookup plus the app-identity check.
 *
 * Idempotent: only rows with no pin are read, and the write only lands while the
 * pin is still unset, so a re-run (or a concurrent connect) never overwrites.
 *
 * Usage:
 *   pnpm --filter @chatbotx.io/connections backfill:credential-pins -- --dry-run
 *   pnpm --filter @chatbotx.io/connections backfill:credential-pins
 *   pnpm --filter @chatbotx.io/connections backfill:credential-pins -- --provider=messenger --workspace=123
 */
import { pathToFileURL } from "node:url"
import {
  platformCredentialService,
  resolveCredentialOwnerIdForWorkspace,
  workspaceService,
} from "@chatbotx.io/business"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import { logger } from "../src/logger"
import { CONNECTION_REGISTRY } from "../src/registry"

const PAGE_SIZE = 200

type CredentialType = Parameters<
  typeof platformCredentialService.findDecryptedPlatform
>[0]["type"]

export type PinBackfillCounts = {
  pinned: number
  noMatch: number
  ambiguous: number
  noClientId: number
  failed: number
}

type Options = {
  dryRun: boolean
  provider?: IntegrationType
  workspaceId?: string
}

const readClientId = (auth: unknown): string | undefined =>
  typeof auth === "object" &&
  auth !== null &&
  "clientId" in auth &&
  typeof auth.clientId === "string" &&
  auth.clientId.length > 0
    ? auth.clientId
    : undefined

type Connection = Awaited<
  ReturnType<typeof platformCredentialService.listUnpinnedConnections>
>[number]

const loadStoredAuth = async (
  provider: IntegrationType,
  connection: Connection,
) => {
  const store = CONNECTION_REGISTRY[provider]?.store
  const foreignKey = connection.inboxId ?? connection.integrationId
  if (!(store && foreignKey)) {
    return
  }
  return await store.loadAuthByForeignKey(foreignKey, connection.workspaceId)
}

const matchingCandidates = async (input: {
  connection: Connection
  type: CredentialType
  clientId: string
}) => {
  const workspace = await workspaceService.findById({
    id: input.connection.workspaceId,
  })
  const ownerId = await resolveCredentialOwnerIdForWorkspace(
    workspace.id,
    workspace,
  )
  const [own, platform] = await Promise.all([
    platformCredentialService.findDecryptedForUser({
      userId: ownerId,
      type: input.type,
      requireOwnCredential: true,
    }),
    platformCredentialService.findDecryptedPlatform({ type: input.type }),
  ])
  return [own, platform].filter(
    (candidate) =>
      candidate !== undefined &&
      readClientId(candidate.config) === input.clientId,
  )
}

const processConnection = async (
  provider: IntegrationType,
  type: CredentialType,
  connection: Connection,
  options: Options,
  counts: PinBackfillCounts,
): Promise<void> => {
  const clientId = readClientId(await loadStoredAuth(provider, connection))
  if (!clientId) {
    counts.noClientId += 1
    return
  }
  const matches = await matchingCandidates({ connection, type, clientId })
  if (matches.length === 0) {
    counts.noMatch += 1
    return
  }
  if (matches.length > 1) {
    counts.ambiguous += 1
    return
  }
  if (!options.dryRun) {
    await platformCredentialService.pinConnectionIfUnset({
      connectionId: connection.id,
      workspaceId: connection.workspaceId,
      platformCredentialId: (matches[0] as { id: string }).id,
    })
  }
  counts.pinned += 1
}

export const backfillCredentialPins = async (
  options: Options,
): Promise<PinBackfillCounts> => {
  const counts: PinBackfillCounts = {
    pinned: 0,
    noMatch: 0,
    ambiguous: 0,
    noClientId: 0,
    failed: 0,
  }
  const providers = (
    Object.keys(CONNECTION_REGISTRY) as IntegrationType[]
  ).filter(
    (provider) =>
      CONNECTION_REGISTRY[provider]?.credentialType &&
      (!options.provider || options.provider === provider),
  )

  for (const provider of providers) {
    const type = CONNECTION_REGISTRY[provider]?.credentialType
    if (!type) {
      continue
    }
    let afterId: string | undefined
    for (;;) {
      const page = await platformCredentialService.listUnpinnedConnections({
        provider,
        afterId,
        workspaceId: options.workspaceId,
        limit: PAGE_SIZE,
      })
      if (page.length === 0) {
        break
      }
      for (const connection of page) {
        try {
          await processConnection(provider, type, connection, options, counts)
        } catch (err) {
          counts.failed += 1
          logger.error(
            { err, connectionId: connection.id, provider },
            "credential pin backfill failed for a connection",
          )
        }
      }
      afterId = page.at(-1)?.id
    }
  }
  return counts
}

const parseOptions = (argv: string[]): Options => ({
  dryRun: argv.includes("--dry-run"),
  provider: argv
    .find((arg) => arg.startsWith("--provider="))
    ?.slice("--provider=".length) as IntegrationType | undefined,
  workspaceId: argv
    .find((arg) => arg.startsWith("--workspace="))
    ?.slice("--workspace=".length),
})

const run = async () => {
  const options = parseOptions(process.argv.slice(2))
  const counts = await backfillCredentialPins(options)
  logger.info(
    { ...counts, dryRun: options.dryRun },
    options.dryRun
      ? "credential pin backfill (dry run, nothing written)"
      : "credential pin backfill done",
  )
  process.exit(counts.failed > 0 ? 1 : 0)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  run().catch((err) => {
    logger.error({ err }, "credential pin backfill crashed")
    process.exit(1)
  })
}
