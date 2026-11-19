import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import type {
  ContactSyncProvider,
  ContactSyncTriggerSource,
} from "@chatbotx.io/database/partials"
import {
  type ContactSyncRunItemInput,
  type ContactSyncRunWithItems,
  coexistSyncRunRepository,
  contactSyncRunRepository,
} from "@chatbotx.io/database/repositories"
import type { ContactSyncRunModel } from "@chatbotx.io/database/types"
import { getChildLogger } from "@chatbotx.io/logger"
import { coexistService } from "../coexist/service"
import {
  CONTACT_SYNC_CONNECT_FALLBACKS,
  CONTACT_SYNC_ERROR_CODES,
  CONTACT_SYNC_MAX_SOURCES_PER_RUN,
  type ContactSyncConnectFallback,
  type ContactSyncFollowUpChannel,
  isContactSyncFollowUpChannel,
} from "./constants"
import {
  discoverContactSyncPages,
  discoveryKey,
  pageOfInbox,
} from "./discovery"
import { contactSyncException } from "./errors"
import { contactSyncAdapters } from "./providers"
import { enqueueContactSyncChunk } from "./queue"
import { lockWorkspaceRuns } from "./run-lock"
import { type ContactSyncInbox, findContactSyncInboxes } from "./source-inboxes"
import type { ContactSyncActor, ContactSyncDiscoveryStatus } from "./types"

const log = getChildLogger("contact-sync-connect")

const PROVIDER: ContactSyncProvider = "ahachat"

type ConnectImportOutcome = "started" | "attached" | "fallback"

/** The outcomes of a page that is imported (not a fallback). */
type ImportedOutcome = Exclude<ConnectImportOutcome, "fallback">

/** One page a connect import is asked for. */
type ConnectImportPageInput = {
  inboxId: string
  /** The AI reads the synced history (the follow-up's coexist choice). */
  aiReadsSyncedHistory: boolean
}

/** What became of one page of a connect import. */
export type ConnectImportPageResult = {
  inboxId: string
  /** `started` = in the new run; `attached` = an import of it was already running. */
  outcome: ConnectImportOutcome
  /** Why the page needs a plain history sync instead; `null` unless `fallback`. */
  fallbackReason: ContactSyncConnectFallback | null
  /**
   * A fallback page's plain history sync was started (or was already running).
   * `false` for an imported page (its history follows the import) and for a page
   * whose history could not be started.
   */
  historyStarted: boolean
}

export type ScheduleConnectImportInput = {
  workspaceId: string
  actor: ContactSyncActor
  triggerSource: ContactSyncTriggerSource
  pages: ConnectImportPageInput[]
}

/** A discovery answer that is not `found` as the fallback it causes. */
const DISCOVERY_FALLBACKS: Record<
  ContactSyncDiscoveryStatus,
  ContactSyncConnectFallback | null
> = {
  found: null,
  absent: CONTACT_SYNC_CONNECT_FALLBACKS.notInAhachat,
  ambiguous: CONTACT_SYNC_CONNECT_FALLBACKS.pageAmbiguous,
  unavailable: CONTACT_SYNC_CONNECT_FALLBACKS.ahachatUnavailable,
}

const fallback = (
  inboxId: string,
  reason: ContactSyncConnectFallback,
): ConnectImportPageResult => ({
  inboxId,
  outcome: "fallback",
  fallbackReason: reason,
  historyStarted: false,
})

const outcome = (
  inboxId: string,
  kind: ImportedOutcome,
): ConnectImportPageResult => ({
  inboxId,
  outcome: kind,
  fallbackReason: null,
  historyStarted: false,
})

/** The first page of an inbox wins when the caller repeats it. */
const dedupePages = (pages: ConnectImportPageInput[]) => {
  const byInbox = new Map<string, ConnectImportPageInput>()
  for (const page of pages) {
    if (!byInbox.has(page.inboxId)) {
      byInbox.set(page.inboxId, page)
    }
  }
  return [...byInbox.values()]
}

type Candidate = {
  page: ConnectImportPageInput
  inbox: ContactSyncInbox
  /** The inbox's channel, narrowed to one a history sync can follow. */
  channel: ContactSyncFollowUpChannel
}

/**
 * The contacts-first import at page connect. The pages that can be imported
 * become items of one `connect` run (no cooldown; tags and fields on, fill
 * only), each owing the normal history sync afterwards. A page that cannot be
 * imported — not in AhaChat, an unrelated run is live, past the item cap, a
 * channel with no history sync to follow, its history already running — is a
 * `fallback` with the reason, so the caller starts its plain history sync at
 * once: history is never silently lost.
 */
export const scheduleContactSyncConnectImport = async (
  input: ScheduleConnectImportInput,
): Promise<{ runId: string | null; pages: ConnectImportPageResult[] }> => {
  if (!contactSyncAdapters[PROVIDER].isConfigured()) {
    throw contactSyncException(
      CONTACT_SYNC_ERROR_CODES.notConfigured,
      "The AhaChat sync is not configured",
      503,
    )
  }
  const requested = dedupePages(input.pages)
  const inboxes = await findContactSyncInboxes(
    input.workspaceId,
    requested.map((page) => page.inboxId),
  )
  const inboxById = new Map(inboxes.map((inbox) => [inbox.id, inbox]))
  const results = new Map<string, ConnectImportPageResult>()
  const candidates: Candidate[] = []
  for (const page of requested) {
    const inbox = inboxById.get(page.inboxId)
    if (!inbox) {
      results.set(
        page.inboxId,
        fallback(
          page.inboxId,
          CONTACT_SYNC_CONNECT_FALLBACKS.inboxNotConnected,
        ),
      )
    } else if (isContactSyncFollowUpChannel(inbox.channel)) {
      candidates.push({ page, inbox, channel: inbox.channel })
    } else {
      results.set(
        page.inboxId,
        fallback(
          page.inboxId,
          CONTACT_SYNC_CONNECT_FALLBACKS.channelUnsupported,
        ),
      )
    }
  }

  const discovery = await discoverContactSyncPages({
    provider: PROVIDER,
    scope: { workspaceId: input.workspaceId, actor: input.actor },
    inboxes: candidates.map((candidate) => candidate.inbox),
  })
  const importable: Candidate[] = []
  for (const candidate of candidates) {
    const entry = discovery.get(discoveryKey(pageOfInbox(candidate.inbox)))
    const reason = DISCOVERY_FALLBACKS[entry?.status ?? "unavailable"]
    if (reason) {
      results.set(
        candidate.page.inboxId,
        fallback(candidate.page.inboxId, reason),
      )
    } else {
      importable.push(candidate)
    }
  }

  const names = new Map(
    [...discovery.values()].map((entry) => [discoveryKey(entry), entry.name]),
  )
  const started = await startConnectRun({ input, importable, names, results })
  await startFallbackHistory({ input, requested, inboxById, results })
  if (started?.created) {
    await enqueueContactSyncChunk(started.created).catch((err) =>
      log.error({ err, runId: started.runId }, "contact sync: enqueue failed"),
    )
  }
  return {
    runId: started?.runId ?? null,
    pages: requested.map(
      (page) =>
        results.get(page.inboxId) ??
        fallback(page.inboxId, CONTACT_SYNC_CONNECT_FALLBACKS.workspaceBusy),
    ),
  }
}

type PageWithIntegration = Candidate & { integrationId: string }

/** The run the pages ended up in; `created` is set when it is new and must be queued. */
type RunPlacement = {
  runId: string
  created: ContactSyncRunWithItems | null
} | null

type ConnectResults = Map<string, ConnectImportPageResult>

const setFallback = (
  results: ConnectResults,
  pages: PageWithIntegration[],
  reason: ContactSyncConnectFallback,
) => {
  for (const { page } of pages) {
    results.set(page.inboxId, fallback(page.inboxId, reason))
  }
}

const setStarted = (results: ConnectResults, pages: PageWithIntegration[]) => {
  for (const { page } of pages) {
    results.set(page.inboxId, outcome(page.inboxId, "started"))
  }
}

/**
 * Locates each page's integration and sorts the pages by it (a fixed order,
 * so two connects over the same pages cannot deadlock).
 */
const locatePages = async (
  tx: DatabaseClient,
  input: ScheduleConnectImportInput,
  importable: Candidate[],
  results: ConnectResults,
): Promise<PageWithIntegration[]> => {
  const located: PageWithIntegration[] = []
  for (const candidate of importable) {
    const integrationId =
      await coexistSyncRunRepository.findIntegrationIdByInbox({
        channel: candidate.channel,
        workspaceId: input.workspaceId,
        inboxId: candidate.inbox.id,
        tx,
      })
    if (integrationId) {
      located.push({ ...candidate, integrationId })
    } else {
      results.set(
        candidate.page.inboxId,
        fallback(
          candidate.page.inboxId,
          CONTACT_SYNC_CONNECT_FALLBACKS.inboxNotConnected,
        ),
      )
    }
  }
  return located.sort((a, b) => a.integrationId.localeCompare(b.integrationId))
}

/**
 * Under each page's integration lock: leaves a page whose history already
 * runs to that run, reuses an import already open for it (merging the
 * follow-up), and returns the pages that still need an item.
 */
const takeUnimportedPages = async (
  tx: DatabaseClient,
  input: ScheduleConnectImportInput,
  located: PageWithIntegration[],
  results: ConnectResults,
): Promise<{
  toImport: PageWithIntegration[]
  attachedRunId: string | null
}> => {
  const toImport: PageWithIntegration[] = []
  let attachedRunId: string | null = null
  for (const page of located) {
    await coexistSyncRunRepository.lockIntegration({
      channel: page.channel,
      workspaceId: input.workspaceId,
      integrationId: page.integrationId,
      tx,
    })
    const historyRunning = await coexistSyncRunRepository.findLiveRun({
      integrationId: page.integrationId,
      channel: page.channel,
      tx,
    })
    if (historyRunning) {
      setFallback(
        results,
        [page],
        CONTACT_SYNC_CONNECT_FALLBACKS.historyRunning,
      )
      continue
    }
    const open = await contactSyncRunRepository.findOpenItemForInbox(
      { workspaceId: input.workspaceId, inboxId: page.inbox.id },
      tx,
    )
    if (!open) {
      toImport.push(page)
      continue
    }
    await contactSyncRunRepository.requestFollowUp(
      {
        itemId: open.id,
        aiReadsSyncedHistory: page.page.aiReadsSyncedHistory,
      },
      tx,
    )
    results.set(page.page.inboxId, outcome(page.page.inboxId, "attached"))
    attachedRunId = open.runId
  }
  return { toImport, attachedRunId }
}

/** A later page of a batch connect joins the connect run the first one started. */
const joinLiveRun = async (
  tx: DatabaseClient,
  args: PlacementArgs & {
    live: ContactSyncRunModel
    attachedRunId: string | null
  },
): Promise<RunPlacement> => {
  const { input, live, toImport, results, attachedRunId } = args
  const appended =
    live.trigger === "connect"
      ? await contactSyncRunRepository.appendItems(
          {
            runId: live.id,
            workspaceId: input.workspaceId,
            maxItems: CONTACT_SYNC_MAX_SOURCES_PER_RUN,
            items: toImport.map(args.itemOf),
          },
          tx,
        )
      : null
  const joined = new Set(appended?.map((item) => item.inboxId))
  setStarted(
    results,
    toImport.filter((page) => joined.has(page.inbox.id)),
  )
  setFallback(
    results,
    toImport.filter((page) => !joined.has(page.inbox.id)),
    appended
      ? CONTACT_SYNC_CONNECT_FALLBACKS.tooManyPages
      : CONTACT_SYNC_CONNECT_FALLBACKS.workspaceBusy,
  )
  // The run is already queued by whoever created it.
  return joined.size > 0 || attachedRunId
    ? { runId: live.id, created: null }
    : null
}

const createConnectRun = async (
  tx: DatabaseClient,
  args: PlacementArgs,
): Promise<RunPlacement> => {
  const { input, toImport, results } = args
  const inRun = toImport.slice(0, CONTACT_SYNC_MAX_SOURCES_PER_RUN)
  setFallback(
    results,
    toImport.slice(CONTACT_SYNC_MAX_SOURCES_PER_RUN),
    CONTACT_SYNC_CONNECT_FALLBACKS.tooManyPages,
  )
  const created = await contactSyncRunRepository.createWithItems(
    {
      workspaceId: input.workspaceId,
      provider: PROVIDER,
      triggerSource: input.triggerSource,
      trigger: "connect",
      requestedByType: input.actor.type,
      requestedById: input.actor.id,
      syncTags: true,
      syncCustomFields: true,
      overwriteExisting: false,
      items: inRun.map(args.itemOf),
    },
    tx,
  )
  if (!created) {
    // Lost the insert to a run committed meanwhile: plain history sync.
    setFallback(results, inRun, CONTACT_SYNC_CONNECT_FALLBACKS.workspaceBusy)
    return null
  }
  setStarted(results, inRun)
  return { runId: created.id, created }
}

type PlacementArgs = {
  input: ScheduleConnectImportInput
  toImport: PageWithIntegration[]
  results: ConnectResults
  itemOf: (page: PageWithIntegration) => ContactSyncRunItemInput
}

/**
 * Under the workspace lock, then the live run's row (the order a worker's
 * write takes), then each page's integration row in id order (the lock a
 * history start and a handoff take): reuses an import already open for a page,
 * leaves a page whose history already runs to that run, and puts the rest in
 * the live connect run or a new one. Returns the run they are in, or `null`.
 */
const startConnectRun = async (args: {
  input: ScheduleConnectImportInput
  importable: Candidate[]
  names: Map<string, string | null>
  results: ConnectResults
}): Promise<RunPlacement> => {
  const { input, importable, names, results } = args
  if (importable.length === 0) {
    return null
  }
  return await db.transaction(async (tx) => {
    await lockWorkspaceRuns(tx, input.workspaceId)
    const live = await contactSyncRunRepository.lockLiveRun(
      input.workspaceId,
      tx,
    )
    const located = await locatePages(tx, input, importable, results)
    const { toImport, attachedRunId } = await takeUnimportedPages(
      tx,
      input,
      located,
      results,
    )
    if (toImport.length === 0) {
      return attachedRunId ? { runId: attachedRunId, created: null } : null
    }
    const placement = {
      input,
      toImport,
      results,
      itemOf: ({ page, inbox }: PageWithIntegration) => ({
        inboxId: inbox.id,
        sourceChannel: inbox.channel,
        sourceAccountId: inbox.sourceId,
        sourceAccountName:
          names.get(discoveryKey(pageOfInbox(inbox))) ?? inbox.name,
        followUpCoexist: true,
        followUpAiReadsSyncedHistory: page.aiReadsSyncedHistory,
      }),
    }
    return live
      ? await joinLiveRun(tx, { ...placement, live, attachedRunId })
      : await createConnectRun(tx, placement)
  })
}

/** Fallbacks whose page is still a connected inbox a history sync can follow. */
const HISTORY_FALLBACKS: ReadonlySet<ContactSyncConnectFallback> = new Set([
  CONTACT_SYNC_CONNECT_FALLBACKS.tooManyPages,
  CONTACT_SYNC_CONNECT_FALLBACKS.workspaceBusy,
  CONTACT_SYNC_CONNECT_FALLBACKS.historyRunning,
  CONTACT_SYNC_CONNECT_FALLBACKS.notInAhachat,
  CONTACT_SYNC_CONNECT_FALLBACKS.pageAmbiguous,
  CONTACT_SYNC_CONNECT_FALLBACKS.ahachatUnavailable,
])

/**
 * The plain history sync of every fallback page, once the run (if any) is
 * committed: history is never silently lost. A page whose history is already
 * live reuses that run; a refusal leaves `historyStarted` false.
 */
const startFallbackHistory = async (args: {
  input: ScheduleConnectImportInput
  requested: ConnectImportPageInput[]
  inboxById: Map<string, ContactSyncInbox>
  results: Map<string, ConnectImportPageResult>
}): Promise<void> => {
  for (const page of args.requested) {
    const result = args.results.get(page.inboxId)
    const inbox = args.inboxById.get(page.inboxId)
    if (
      !(
        result?.fallbackReason &&
        HISTORY_FALLBACKS.has(result.fallbackReason) &&
        inbox &&
        isContactSyncFollowUpChannel(inbox.channel)
      )
    ) {
      continue
    }
    const channel = inbox.channel
    try {
      const integrationId =
        await coexistSyncRunRepository.findIntegrationIdByInbox({
          channel,
          workspaceId: args.input.workspaceId,
          inboxId: inbox.id,
        })
      const enabled = integrationId
        ? await coexistService.enable({
            workspaceId: args.input.workspaceId,
            integrationId,
            channel,
            aiReadsSyncedHistory: page.aiReadsSyncedHistory,
          })
        : null
      args.results.set(page.inboxId, {
        ...result,
        historyStarted: enabled?.success === true,
      })
    } catch (err) {
      log.error(
        { err, inboxId: inbox.id },
        "contact sync: fallback history start failed",
      )
    }
  }
}
