import type { DatabaseClient } from "@chatbotx.io/database/client"
import type { ContactScanRunStatus } from "@chatbotx.io/database/partials"
import {
  type CoexistRunProgressInput,
  type CoexistRunWriteGuard,
  type ContactScanRetryOutcome,
  coexistSyncRunRepository,
  type IncrementProgressCounters,
  type PickedCoexistRun,
} from "@chatbotx.io/database/repositories"
import type { CoexistSyncRunModel } from "@chatbotx.io/database/types"
import {
  type ContactScanChannel,
  isContactScanChannel,
} from "@chatbotx.io/utils/channel"
import { BaseService } from "../base.service"
import { ChatbotXException } from "../errors"
import { inboxService } from "../inbox/service"
import {
  type ContactScanAvailability,
  type ContactScanBlockedReason,
  OPEN_CONTACT_SCAN_AVAILABILITY,
  resolveContactScanAvailability,
} from "./availability"
import { contactScanIntegrationRefs } from "./channel-registry"
import {
  CONTACT_SCAN_ERRORS,
  CONTACT_SCAN_MAX_ATTEMPTS,
  CONTACT_SCAN_RELEASED_GRACE_MS,
  CONTACT_SCAN_TRIGGER_SOURCE,
} from "./constants"
import { resolveContactScanRunStatus } from "./run-status"

export type ContactScanScheduleInput = {
  workspaceId: string
  inboxId: string
  requestedByUserId: string | null
  scanFromAt: Date
}

export type ContactScanRunView = Pick<
  CoexistSyncRunModel,
  | "id"
  | "scanFromAt"
  | "createdAt"
  | "startedAt"
  | "finishedAt"
  | "importedContactCount"
  | "currentScan"
  | "currentError"
> & { status: ContactScanRunStatus }

export type ContactScanStatusView = {
  status: ContactScanRunStatus | "idle"
  latest: ContactScanRunView | null
  availability: ContactScanAvailability
}

/**
 * One row of the Automatic Customer Scan history list. Channel-agnostic on
 * purpose (plan §3(a)/`docs/contact-scan.md`) — `channel` is shown as plain
 * data, never branched on, so this shape stays identical across Messenger
 * and Instagram scans.
 */
export type ContactScanHistoryItem = Pick<
  CoexistSyncRunModel,
  | "id"
  | "workspaceId"
  | "channel"
  | "scanFromAt"
  | "importedContactCount"
  | "currentScan"
  | "startedAt"
  | "finishedAt"
  | "createdAt"
  | "requestedByUserId"
  | "currentError"
> & { status: ContactScanRunStatus }

export type ContactScanHistoryView = {
  data: ContactScanHistoryItem[]
  pageCount: number
}

/**
 * One `ChatbotXException` factory per `ContactScanAvailability.blockedReason`
 * — a table instead of an if/cooldown-else-running branch, so a third
 * blocked reason added to the type is a compile error here.
 */
const scheduleBlockedExceptions = {
  cooldown: () =>
    new ChatbotXException(
      "This inbox was scanned recently. Please wait before scanning again.",
      "contactScanCooldown",
      409,
    ),
  running: () =>
    new ChatbotXException(
      "A scan is already running for this inbox.",
      "contactScanAlreadyRunning",
      409,
    ),
} satisfies Record<ContactScanBlockedReason, () => ChatbotXException>

/**
 * Terminal statuses `finish` can write. One handler per status — a table,
 * not an if/else — so `satisfies Record<...>` catches a missing arm if the
 * union ever grows.
 */
type ContactScanTerminalStatus = "succeeded" | "partial" | "failed"

type FinishInput = {
  runId: string
  currentError?: string
  expect?: CoexistRunWriteGuard
}

const finishHandlers = {
  succeeded: (input: FinishInput) =>
    coexistSyncRunRepository.markSucceeded({
      runId: input.runId,
      expect: input.expect,
    }),
  partial: (input: FinishInput) =>
    coexistSyncRunRepository.markPartial({
      runId: input.runId,
      currentError: input.currentError,
      expect: input.expect,
    }),
  failed: (input: FinishInput) =>
    coexistSyncRunRepository.markFailed({
      runId: input.runId,
      currentError: input.currentError ?? "Contact scan failed",
      expect: input.expect,
    }),
} satisfies Record<
  ContactScanTerminalStatus,
  (input: FinishInput) => Promise<number>
>

const toRunView = (run: CoexistSyncRunModel): ContactScanRunView => ({
  id: run.id,
  status: resolveContactScanRunStatus(run),
  scanFromAt: run.scanFromAt,
  createdAt: run.createdAt,
  startedAt: run.startedAt,
  finishedAt: run.finishedAt,
  importedContactCount: run.importedContactCount,
  currentScan: run.currentScan,
  currentError: run.currentError,
})

const toHistoryItem = (run: CoexistSyncRunModel): ContactScanHistoryItem => ({
  id: run.id,
  workspaceId: run.workspaceId,
  channel: run.channel,
  status: resolveContactScanRunStatus(run),
  scanFromAt: run.scanFromAt,
  importedContactCount: run.importedContactCount,
  currentScan: run.currentScan,
  startedAt: run.startedAt,
  finishedAt: run.finishedAt,
  createdAt: run.createdAt,
  requestedByUserId: run.requestedByUserId,
  currentError: run.currentError,
})

const IDLE_STATUS_VIEW: ContactScanStatusView = {
  status: "idle",
  latest: null,
  availability: OPEN_CONTACT_SCAN_AVAILABILITY,
}

class ContactScanService extends BaseService {
  /**
   * Schedules a new Automatic Customer Scan. Steps exactly follow plan
   * §3.2 (`docs/plans/2026-09-09-automatic-contact-scan.md`) — each failure
   * is a distinct `ChatbotXException` code/status so the builder action can
   * map it to a field-level validation error.
   */
  async schedule(input: ContactScanScheduleInput): Promise<{ runId: string }> {
    const { workspaceId, inboxId, requestedByUserId, scanFromAt } = input

    // 1. `scanFromAt` must be in the past.
    if (scanFromAt.getTime() >= Date.now()) {
      throw new ChatbotXException(
        "Scan-from time must be in the past.",
        "contactScanFromTimeInvalid",
        400,
      )
    }

    // 2. Inbox must exist in this workspace.
    const inbox = await inboxService.findWithIntegrations({
      where: { id: inboxId, workspaceId },
    })
    if (!inbox) {
      throw new ChatbotXException(
        "Inbox not found.",
        "contactScanInboxNotFound",
        404,
      )
    }

    // 3. Channel must support the scan.
    if (!isContactScanChannel(inbox.channel)) {
      throw new ChatbotXException(
        "This channel does not support Automatic Customer Scan.",
        "contactScanChannelUnsupported",
        400,
      )
    }

    // 4. Inbox must be connected AND carry the channel's integration relation.
    const integrationRef = contactScanIntegrationRefs[inbox.channel](inbox)
    if (inbox.status !== "connected" || !integrationRef) {
      throw new ChatbotXException(
        "This inbox is not connected.",
        "contactScanIntegrationDisconnected",
        400,
      )
    }

    // 5. Reserved hook: cloud entitlement gate — no-op in OSS.

    // 6. Cooldown / already-running gate.
    const latest = await coexistSyncRunRepository.findLatestContactScanRun({
      workspaceId,
      integrationId: integrationRef.integrationId,
    })
    const availability = resolveContactScanAvailability({
      latest,
      now: new Date(),
    })
    if (!availability.canScan) {
      throw scheduleBlockedExceptions[availability.blockedReason]()
    }

    // 7. Create the run; `null` means we lost a concurrent-submit race on
    // the partial unique index.
    const run = await coexistSyncRunRepository.createContactScanRun({
      workspaceId,
      integrationId: integrationRef.integrationId,
      channel: inbox.channel,
      requestedByUserId,
      scanFromAt,
      triggerSource: CONTACT_SCAN_TRIGGER_SOURCE,
    })
    if (!run) {
      throw scheduleBlockedExceptions.running()
    }

    return { runId: run.id }
  }

  /**
   * `CoexistSyncRun` has no `inboxId` (only `workspaceId` + `integrationId`),
   * so this resolves inbox → integration workspace-scoped first, exactly
   * like `schedule` steps 2–4. An inbox that is missing, not a scan channel,
   * or has no integration relation returns the `idle` view WITHOUT calling
   * `findLatestContactScanRun` — there is nothing to look up.
   */
  async getStatus(input: {
    workspaceId: string
    inboxId: string
  }): Promise<ContactScanStatusView> {
    const { workspaceId, inboxId } = input

    const inbox = await inboxService.findWithIntegrations({
      where: { id: inboxId, workspaceId },
    })
    if (!(inbox && isContactScanChannel(inbox.channel))) {
      return IDLE_STATUS_VIEW
    }

    const integrationRef = contactScanIntegrationRefs[inbox.channel](inbox)
    if (!integrationRef) {
      return IDLE_STATUS_VIEW
    }

    const latest = await coexistSyncRunRepository.findLatestContactScanRun({
      workspaceId,
      integrationId: integrationRef.integrationId,
    })

    return {
      status: latest ? resolveContactScanRunStatus(latest) : "idle",
      latest: latest ? toRunView(latest) : null,
      availability: resolveContactScanAvailability({ latest, now: new Date() }),
    }
  }

  /**
   * Cancels the inbox's live scan (`init`/`running`) so it stops at its next
   * write; contacts already imported are kept. Same inbox → integration
   * resolution as `getStatus`, workspace-scoped. Nothing running (or no such
   * inbox) is not an error: it returns `cancelled: false`, so the call is safe
   * to repeat. The cancelled scan still counts toward the 24h cooldown, which
   * is measured from `createdAt`.
   */
  async cancel(input: {
    workspaceId: string
    inboxId: string
  }): Promise<{ cancelled: boolean }> {
    const { workspaceId, inboxId } = input

    const inbox = await inboxService.findWithIntegrations({
      where: { id: inboxId, workspaceId },
    })
    if (!(inbox && isContactScanChannel(inbox.channel))) {
      return { cancelled: false }
    }
    const integrationRef = contactScanIntegrationRefs[inbox.channel](inbox)
    if (!integrationRef) {
      return { cancelled: false }
    }

    const cancelledRuns =
      await coexistSyncRunRepository.cancelActiveContactScanRuns({
        channel: inbox.channel,
        integrationId: integrationRef.integrationId,
        workspaceId,
        currentError: CONTACT_SCAN_ERRORS.cancelled,
      })
    return { cancelled: cancelledRuns > 0 }
  }

  /**
   * Ends the live scan of an integration that is being disconnected, inside the
   * caller's transaction, so no scan is left walking a channel that is gone.
   */
  async cancelForIntegration(input: {
    channel: ContactScanChannel
    integrationId: string
    tx: DatabaseClient
  }): Promise<void> {
    await coexistSyncRunRepository.cancelActiveContactScanRuns({
      ...input,
      currentError: CONTACT_SCAN_ERRORS.cancelled,
    })
  }

  /** Scheduler pick — always `type: "contact_scan"`, never passed by the caller. */
  pickDue(input: {
    batchSize: number
    maxAttempts: number
  }): Promise<PickedCoexistRun[]> {
    return coexistSyncRunRepository.pickDueRuns({
      ...input,
      type: "contact_scan",
      releasedGraceMs: CONTACT_SCAN_RELEASED_GRACE_MS,
    })
  }

  /** Scheduler terminal sweep — always `type: "contact_scan"`. */
  markMaxAttemptsFailed(input: { maxAttempts: number }): Promise<void> {
    return coexistSyncRunRepository.markMaxAttemptsFailed({
      ...input,
      type: "contact_scan",
    })
  }

  claim(input: { runId: string }): Promise<CoexistSyncRunModel | null> {
    return coexistSyncRunRepository.claimContactScanRun(input)
  }

  /** @returns rows written — 0 means the claim was taken over before yielding. */
  yieldForContinuation(input: {
    runId: string
    expect: CoexistRunWriteGuard
    attempts?: number
  }): Promise<number> {
    return coexistSyncRunRepository.yieldForContinuation(input)
  }

  /** @returns rows written — 0 means the run was not in the released state. */
  reopenReleased(input: { runId: string }): Promise<number> {
    return coexistSyncRunRepository.reopenReleased(input)
  }

  /** @returns rows written — 0 means the `expect` guard did not hold. */
  updateProgress(input: CoexistRunProgressInput): Promise<number> {
    return coexistSyncRunRepository.updateProgress(input)
  }

  /**
   * Mirrors the repository's overloads by hand (see `CoexistService`'s
   * identical comment) — `Parameters<...>[0]` on an overloaded function
   * resolves to the LAST signature only, which would force every caller
   * that omits `expect` onto the `expect`-required overload.
   */
  incrementProgress(input: {
    runId: string
    increments: IncrementProgressCounters
    fields?: CoexistRunProgressInput["fields"]
  }): Promise<undefined>
  incrementProgress(input: {
    runId: string
    increments: IncrementProgressCounters
    fields?: CoexistRunProgressInput["fields"]
    expect: CoexistRunWriteGuard
  }): Promise<number>
  incrementProgress(input: {
    runId: string
    increments: IncrementProgressCounters
    fields?: CoexistRunProgressInput["fields"]
    expect?: CoexistRunWriteGuard
  }): Promise<number | undefined> {
    return coexistSyncRunRepository.incrementProgress(input)
  }

  /**
   * Terminalizes a run as `succeeded` / `partial` / `failed` via one lookup
   * table instead of a branch per status.
   */
  finish(input: {
    runId: string
    status: ContactScanTerminalStatus
    currentError?: string
    expect?: CoexistRunWriteGuard
  }): Promise<number> {
    return finishHandlers[input.status](input)
  }

  /**
   * Hands a run back after a TRANSIENT failure (network, 5xx): `init` for the
   * sweeper while attempts remain, `failed` immediately on the last one.
   *
   * @returns `null` when the `expect` guard did not hold.
   */
  retryOrFail(input: {
    runId: string
    expect: CoexistRunWriteGuard
    /** The sentinel shown while it waits for the retry; defaults to a provider failure. */
    retryError?: string
  }): Promise<ContactScanRetryOutcome | null> {
    return coexistSyncRunRepository.retryOrFailContactScanRun({
      runId: input.runId,
      maxAttempts: CONTACT_SCAN_MAX_ATTEMPTS,
      retryError: input.retryError ?? CONTACT_SCAN_ERRORS.providerRetryable,
      exhaustedError: CONTACT_SCAN_ERRORS.maxAttempts,
      expect: input.expect,
    })
  }

  findRunById(input: { runId: string }): Promise<CoexistSyncRunModel | null> {
    return coexistSyncRunRepository.findRunById(input)
  }

  /**
   * Paginated Automatic Customer Scan history for the workspace — the
   * `contact-scan` mirror of `ImportService.list`. Delegates straight to
   * the type-scoped `listContactScanRuns` (always `type: "contact_scan"`,
   * never passed by the caller) and narrows each row to the history view
   * shape.
   */
  async listHistory(input: {
    workspaceId: string
    integrationId?: string
    page?: number
    perPage?: number
    sort?: { id: string; desc: boolean }[]
  }): Promise<ContactScanHistoryView> {
    const { data, pageCount } =
      await coexistSyncRunRepository.listContactScanRuns(input)

    return {
      data: data.map(toHistoryItem),
      pageCount,
    }
  }
}

export const contactScanService = new ContactScanService()
