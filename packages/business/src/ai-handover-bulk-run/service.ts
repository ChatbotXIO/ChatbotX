import { db } from "@chatbotx.io/database/client"
import {
  AI_HANDOVER_BULK_LIVE_STATUSES,
  type AiHandoverBulkAction,
  type AiHandoverChannel,
  inboxStatuses,
  parseAiHandoverChannel,
} from "@chatbotx.io/database/partials"
import type { BulkEligibilityInput } from "@chatbotx.io/database/queries"
import {
  type AiHandoverBulkRunGuard,
  type AiHandoverBulkRunInboxRef,
  type AiHandoverBulkRunProgressInput,
  aiHandoverBulkRunRepository,
  aiHandoverSettingsRepository,
  contactInboxRepository,
  type FinishAiHandoverBulkRunInput,
} from "@chatbotx.io/database/repositories"
import type {
  AiHandoverBulkRunModel,
  AiHandoverSettingsModel,
  InboxModel,
} from "@chatbotx.io/database/types"
import { getChildLogger } from "@chatbotx.io/logger"
import { distributedLock } from "@chatbotx.io/redis"
import { AI_HANDOVER_CHANNEL_POLICIES } from "@chatbotx.io/utils/channel"
import {
  buildAiHandoverBulkJobId,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import {
  aiHandoverSettingsService,
  type SaveAiHandoverSettingsInput,
} from "../ai-handover-settings/service"
import { BaseService } from "../base.service"
import { ChatbotXException } from "../errors"
import { inboxService } from "../inbox/service"
import {
  AI_HANDOVER_BULK_ERROR_CODES,
  AI_HANDOVER_BULK_MAX_ATTEMPTS,
} from "./constants"

const log = getChildLogger("ai-handover-bulk-run")

export type SetApplyToAllInput = AiHandoverBulkRunInboxRef & {
  /** `null` for a workspace-token caller, which has no session user. */
  userId: string | null
  /** The desired state: `true` hands every eligible thread to the AI. */
  applyToAllCustomers: boolean
  /** Required for an OFF: the text sent with the HUMAN_AGENT tag. */
  message?: string | null
  /**
   * The most threads the caller accepts to be touched. The change is refused
   * when more are eligible at request time, and when its run cannot start
   * immediately (the count would go stale). It is a check, not a cap on the
   * run: customers who become eligible while the run progresses are still
   * included. Omitted by the builder, which confirms in the UI.
   */
  confirmMaxEligible?: number
}

/** What a change would do, without making it. */
export type ApplyToAllPreview = {
  /** `false` when the Page already is in the requested state. */
  isChanged: boolean
  /** Threads the run would touch right now (an estimate: customers keep writing). */
  eligibleCount: number
}

/** What a change of the desired state did. */
export type ApplyToAllChange = {
  /** `false` when the Page already was in the requested state: nothing happened. */
  isChanged: boolean
  run: AiHandoverBulkRunModel | null
}

/** The Page's desired state and the run that serves its latest revision. */
export type ApplyToAllStatus = {
  applyToAllCustomers: boolean
  revision: number
  /** `null` while the latest revision has no run yet (it is being reconciled). */
  run: AiHandoverBulkRunModel | null
}

/** What a run needs of the Page it walks. */
export type BulkRunInbox = Pick<InboxModel, "id" | "threadControlSeenAt"> & {
  channel: AiHandoverChannel
}

/** What a chunk job needs to be (re)dispatched. */
export type AiHandoverBulkChunkRef = Pick<
  AiHandoverBulkRunModel,
  "id" | "workspaceId" | "attempts" | "chunkSeq"
>

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Who a run acts on, as of `now`. A disable can only reach contacts inside the
 * channel's takeover-message window; an enable only the recently active ones.
 * Both windows are the channel's policy.
 */
const eligibilityOf = (
  run: Pick<AiHandoverBulkRunModel, "action" | "requestedAt" | "channel">,
  now: Date,
): BulkEligibilityInput => {
  const policy = AI_HANDOVER_CHANNEL_POLICIES[run.channel]
  const windowMs =
    run.action === "disable"
      ? policy.takeoverMessageWindowMs
      : policy.handToAiActiveWithinDays * MS_PER_DAY
  return {
    action: run.action,
    requestedAt: run.requestedAt,
    now,
    lastIncomingSince: new Date(now.getTime() - windowMs),
  }
}

/**
 * BullMQ states in which a chunk job has not started and will still run. An
 * `active` job is deliberately not one: it may be a hung worker whose run's
 * lease went stale, which is what the sweeper's takeover exists for.
 */
const QUEUED_JOB_STATES: string[] = [
  "waiting",
  "delayed",
  "prioritized",
  "waiting-children",
]

const bulkException = (code: string, message: string) =>
  new ChatbotXException(message, code, 422)

type AiHandoverSettingsFields = Omit<
  SaveAiHandoverSettingsInput,
  "workspaceId" | "inboxId"
>

/** The saved fields, or everything off for a Page that never saved any. */
const toAiHandoverSettingsFields = (
  saved: Pick<AiHandoverSettingsModel, keyof AiHandoverSettingsFields> | null,
): AiHandoverSettingsFields => ({
  enabled: saved?.enabled ?? false,
  scheduleEnabled: saved?.scheduleEnabled ?? false,
  timeRanges: saved?.timeRanges ?? [],
  gotoFlowId: saved?.gotoFlowId ?? null,
  returnMessage: saved?.returnMessage ?? null,
  pauseBotWaitingForStaff: saved?.pauseBotWaitingForStaff ?? false,
})

const SETTINGS_LOCK_SECONDS = 30

const withSettingsLock = <T>(inboxId: string, fn: () => Promise<T>) =>
  distributedLock.runExclusive({
    key: `ai-handover-settings:${inboxId}`,
    timeoutInSeconds: SETTINGS_LOCK_SECONDS,
    fn,
  })

class AiHandoverBulkRunService extends BaseService {
  /**
   * Sets the Page's desired "apply to all customers" state. A request for the
   * state the Page already is in changes nothing (no run, no write). A real
   * change bumps the state's revision, cancels the run of the older revision
   * (an unclaimed one ends at once; a claimed one stops at its next batch) and
   * creates the run for the new revision, or leaves that to `reconcile` once the
   * old one has stopped.
   *
   * It all happens under the settings row lock, so the state each request reads
   * is the one it writes against.
   *
   * - ON: the Page's automation must be running right now. Otherwise its
   *   take-back would undo the hand-off on the very next customer message.
   * - OFF: the tagged message is required and bounded; it is only ever sent to
   *   threads the AI currently holds (decided per batch by the engine).
   */
  async setApplyToAll(input: SetApplyToAllInput): Promise<ApplyToAllChange> {
    const { workspaceId, inboxId } = input
    const ref = { workspaceId, inboxId }
    const inbox = await aiHandoverSettingsService.requireInbox(ref)
    const message = this.validateMessage(input, inbox.channel)
    await this.assertWithinConfirmedCount(input)

    const change = await db
      .transaction(async (tx) => {
        // Locked first, created only for a real change: a request for the state
        // the Page is already in must leave no trace (a stray settings row would
        // switch on the take-back for a Page nobody configured).
        const existing = await aiHandoverSettingsRepository.lockExisting(
          ref,
          tx,
        )
        if (
          (existing?.settings.applyToAllCustomers ?? false) ===
          input.applyToAllCustomers
        ) {
          return { isChanged: false, run: null }
        }
        const { settings, inboxStatus } =
          existing ??
          (await aiHandoverSettingsRepository.lockForApplyToAll(
            { ...ref, channel: inbox.channel },
            tx,
          ))
        if (settings.applyToAllCustomers === input.applyToAllCustomers) {
          // A concurrent first change got there between the two locks.
          return { isChanged: false, run: null }
        }
        await this.assertCanApply(
          settings,
          inboxStatus,
          input.applyToAllCustomers,
        )
        // The pre-check above ran against the state read before the lock; a
        // concurrent change can make this request a real transition after all.
        if (input.confirmMaxEligible !== undefined) {
          this.assertCountWithinConfirmed(
            input,
            await this.countEligibleForChange({
              ...ref,
              channel: inbox.channel,
              applyToAllCustomers: input.applyToAllCustomers,
            }),
          )
        }

        const updated = await aiHandoverSettingsRepository.setApplyToAll(
          {
            ...ref,
            applyToAllCustomers: input.applyToAllCustomers,
            applyToAllMessage: message,
            requestedByUserId: input.userId,
          },
          tx,
        )
        await aiHandoverBulkRunRepository.cancelLive(ref, tx)
        const run = await this.createRunIfDue(updated, inboxStatus, tx)
        if (input.confirmMaxEligible !== undefined && !run) {
          // Thrown inside the transaction: nothing is written.
          throw bulkException(
            AI_HANDOVER_BULK_ERROR_CODES.runNotStartable,
            "A previous run was still running on this Page and has been told to stop. The confirmed count would be stale by the time this change could start: try again shortly.",
          )
        }
        return { isChanged: true, run }
      })
      .catch(async (error: unknown) => {
        // The refusal rolled the cancel back with the rest, so a run mid-chunk
        // would keep going: make the cancel stick (own transaction) so the
        // caller's retry finds the Page free.
        if (
          error instanceof ChatbotXException &&
          error.code === AI_HANDOVER_BULK_ERROR_CODES.runNotStartable
        ) {
          await this.cancelLiveForInbox(ref)
        }
        throw error
      })

    await this.afterChange(inboxId, change.run)
    return change
  }

  /**
   * What `setApplyToAll` would do for the same request, without writing: the
   * same refusals (page connected, an ON needs the automation running, an OFF
   * needs its message) and the number of threads the run would touch.
   */
  async previewApplyToAll(
    input: Omit<SetApplyToAllInput, "userId" | "confirmMaxEligible">,
  ): Promise<ApplyToAllPreview> {
    const { workspaceId, inboxId } = input
    const ref = { workspaceId, inboxId }
    const inbox = await aiHandoverSettingsService.requireInbox(ref)
    this.validateMessage(input, inbox.channel)

    const settings = await aiHandoverSettingsRepository.findByInbox(ref)
    if (
      (settings?.applyToAllCustomers ?? false) === input.applyToAllCustomers
    ) {
      return { isChanged: false, eligibleCount: 0 }
    }
    if (inbox.status !== inboxStatuses.enum.connected) {
      throw bulkException(
        AI_HANDOVER_BULK_ERROR_CODES.pageNotConnected,
        "The Page is not connected",
      )
    }
    if (
      input.applyToAllCustomers &&
      !(settings && (await aiHandoverSettingsService.isActiveNow(settings)))
    ) {
      throw bulkException(
        AI_HANDOVER_BULK_ERROR_CODES.automationNotActive,
        "Business AI automation must be enabled and running",
      )
    }

    const eligibleCount = await this.countEligibleForChange({
      ...ref,
      channel: inbox.channel,
      applyToAllCustomers: input.applyToAllCustomers,
    })
    return { isChanged: true, eligibleCount }
  }

  /** Threads a run for this change would touch, as of now. */
  private countEligibleForChange(input: {
    workspaceId: string
    inboxId: string
    channel: Parameters<typeof eligibilityOf>[0]["channel"]
    applyToAllCustomers: boolean
  }): Promise<number> {
    const now = new Date()
    return contactInboxRepository.countBulkAiEligible({
      ...eligibilityOf(
        {
          action: input.applyToAllCustomers ? "enable" : "disable",
          requestedAt: now,
          channel: input.channel,
        },
        now,
      ),
      workspaceId: input.workspaceId,
      inboxId: input.inboxId,
      afterId: null,
    })
  }

  /** Refuses a change that would touch more threads than the caller confirmed. */
  private async assertWithinConfirmedCount(
    input: SetApplyToAllInput,
  ): Promise<void> {
    if (input.confirmMaxEligible === undefined) {
      return
    }
    const { userId: _userId, confirmMaxEligible: _max, ...request } = input
    const { isChanged, eligibleCount } = await this.previewApplyToAll(request)
    if (isChanged) {
      this.assertCountWithinConfirmed(input, eligibleCount)
    }
  }

  private assertCountWithinConfirmed(
    input: SetApplyToAllInput,
    eligibleCount: number,
  ): void {
    if (
      input.confirmMaxEligible !== undefined &&
      eligibleCount > input.confirmMaxEligible
    ) {
      throw bulkException(
        AI_HANDOVER_BULK_ERROR_CODES.confirmCountExceeded,
        `${eligibleCount} threads are eligible, more than the ${input.confirmMaxEligible} confirmed`,
      )
    }
  }

  /**
   * Saves a Page's AI hand-over settings. Switching the automation off ends a
   * running enable (its hand-overs would be undone by the take-back anyway); a
   * disable is meant to finish. The engine's cached check already stops it at
   * the next batch, so a failure to stop it is logged, never fatal to the save.
   */
  /**
   * Saves the Page's settings. Serialized per Page with `patchSettings`, so a
   * partial update always merges onto the latest saved settings.
   */
  async saveSettings(
    input: SaveAiHandoverSettingsInput,
  ): Promise<AiHandoverSettingsModel> {
    return await withSettingsLock(input.inboxId, () =>
      this.saveSettingsUnlocked(input),
    )
  }

  /**
   * Changes only the given fields: the others keep their saved value (a Page
   * that never saved settings starts from everything off). Read fresh under
   * the Page's lock, so two partial updates never overwrite each other.
   */
  async patchSettings(
    input: AiHandoverBulkRunInboxRef & {
      changes: Partial<AiHandoverSettingsFields>
    },
  ): Promise<AiHandoverSettingsModel> {
    const { workspaceId, inboxId, changes } = input
    return await withSettingsLock(inboxId, async () => {
      await aiHandoverSettingsService.requireInbox({ workspaceId, inboxId })
      const saved = await aiHandoverSettingsRepository.findByInbox({
        workspaceId,
        inboxId,
      })
      const definedChanges = Object.fromEntries(
        Object.entries(changes).filter(([, value]) => value !== undefined),
      ) as Partial<AiHandoverSettingsFields>
      return await this.saveSettingsUnlocked({
        ...toAiHandoverSettingsFields(saved),
        ...definedChanges,
        workspaceId,
        inboxId,
      })
    })
  }

  private async saveSettingsUnlocked(
    input: SaveAiHandoverSettingsInput,
  ): Promise<AiHandoverSettingsModel> {
    const saved = await aiHandoverSettingsService.save(input)
    if (!saved.enabled) {
      const { workspaceId, inboxId } = input
      try {
        await this.cancelLiveForInbox({
          workspaceId,
          inboxId,
          action: "enable",
        })
      } catch (err) {
        log.error(
          { err, inboxId },
          "AI hand-over settings saved off: could not stop the Page's enable run",
        )
      }
    }
    return saved
  }

  /**
   * Starts the Page's latest revision again after its run failed or was
   * stopped (the card's Retry): the same desired state under a new revision,
   * under the same rules as the change itself.
   */
  async retry(
    input: AiHandoverBulkRunInboxRef & { userId: string | null },
  ): Promise<ApplyToAllChange> {
    const { workspaceId, inboxId } = input
    const ref = { workspaceId, inboxId }
    await aiHandoverSettingsService.requireInbox(ref)

    const run = await db.transaction(async (tx) => {
      const locked = await aiHandoverSettingsRepository.lockExisting(ref, tx)
      const latest = locked
        ? await aiHandoverBulkRunRepository.findByRevision(
            { ...ref, revision: locked.settings.applyToAllRevision },
            tx,
          )
        : null
      if (
        !(locked && latest) ||
        ["completed", ...AI_HANDOVER_BULK_LIVE_STATUSES].includes(latest.status)
      ) {
        throw bulkException(
          AI_HANDOVER_BULK_ERROR_CODES.nothingToRetry,
          "There is nothing to retry",
        )
      }
      const { settings, inboxStatus } = locked
      await this.assertCanApply(
        settings,
        inboxStatus,
        settings.applyToAllCustomers,
      )

      const updated = await aiHandoverSettingsRepository.setApplyToAll(
        {
          ...ref,
          applyToAllCustomers: settings.applyToAllCustomers,
          applyToAllMessage: settings.applyToAllMessage,
          requestedByUserId: input.userId,
        },
        tx,
      )
      return await this.createRunIfDue(updated, inboxStatus, tx)
    })

    await this.afterChange(inboxId, run)
    return { isChanged: true, run }
  }

  /**
   * Creates the run the Page's latest revision is waiting for, if it is due.
   * Called after a run ended (the one that was cancelled for a newer revision
   * was still winding down when the change was made) and by the sweeper as a
   * safety net, so a change is never lost. Safe to call at any time and from
   * any number of places: it runs under the settings row lock and the
   * `(Page, revision)` unique index admits one run per revision.
   */
  async reconcile(input: AiHandoverBulkRunInboxRef): Promise<void> {
    const { workspaceId, inboxId } = input
    const ref = { workspaceId, inboxId }
    const run = await db.transaction(async (tx) => {
      const locked = await aiHandoverSettingsRepository.lockExisting(ref, tx)
      return locked
        ? await this.createRunIfDue(locked.settings, locked.inboxStatus, tx)
        : null
    })
    await this.afterChange(inboxId, run)
  }

  /**
   * Stops the Page's live run, for whatever ended its reason to run: the Page
   * was disconnected or deleted, or its automation switched off. An unclaimed
   * run ends at once; a claimed one stops at its next batch. The durable half
   * of the stop guarantee (the cached settings check is only a pre-check), and
   * it takes the same lock as a change, so it cannot interleave with a run being
   * created on the Page it is stopping: call it AFTER the disconnect commits.
   * `action` limits it to runs of that action: switching the automation off
   * stops an enable, while a disable is meant to finish.
   */
  async cancelLiveForInbox(
    input: AiHandoverBulkRunInboxRef & { action?: AiHandoverBulkAction },
  ): Promise<void> {
    const { action, ...ref } = input
    await db.transaction(async (tx) => {
      if (await aiHandoverSettingsRepository.lockExisting(ref, tx)) {
        await aiHandoverBulkRunRepository.cancelLive({ ...ref, action }, tx)
      }
    })
    // The caller's change is committed now, so a re-read cannot refill the
    // cache with the old connection state.
    try {
      await aiHandoverSettingsService.invalidate(input)
    } catch (err) {
      log.warn(
        { err, inboxId: input.inboxId },
        "AI hand-over settings cache invalidation failed",
      )
    }
  }

  /** The Page's desired state and the run serving its latest revision. */
  async findStatus(
    input: AiHandoverBulkRunInboxRef,
  ): Promise<ApplyToAllStatus> {
    const settings = await aiHandoverSettingsRepository.findByInbox(input)
    const revision = settings?.applyToAllRevision ?? 0
    return {
      applyToAllCustomers: settings?.applyToAllCustomers ?? false,
      revision,
      run:
        revision > 0
          ? await aiHandoverBulkRunRepository.findByRevision({
              ...input,
              revision,
            })
          : null,
    }
  }

  listHistory(
    input: AiHandoverBulkRunInboxRef & { page?: number; perPage?: number },
  ) {
    return aiHandoverBulkRunRepository.listHistory(input)
  }

  /**
   * The rules for putting a Page into a desired state, checked under the lock:
   * the Page is connected, and an ON has the Page's automation running behind
   * it (otherwise its take-back would undo the hand-off on the very next
   * customer message).
   */
  private async assertCanApply(
    settings: AiHandoverSettingsModel,
    inboxStatus: string,
    applyToAllCustomers: boolean,
  ): Promise<void> {
    if (inboxStatus !== inboxStatuses.enum.connected) {
      throw bulkException(
        AI_HANDOVER_BULK_ERROR_CODES.pageNotConnected,
        "The Page is not connected",
      )
    }
    if (
      applyToAllCustomers &&
      !(await aiHandoverSettingsService.isActiveNow(settings))
    ) {
      throw bulkException(
        AI_HANDOVER_BULK_ERROR_CODES.automationNotActive,
        "Business AI automation must be enabled and running",
      )
    }
  }

  /**
   * The run due for the settings' latest revision, created under the caller's
   * transaction (which holds the row lock). Nothing is due when the revision
   * already ran (a failed or stopped run of it is final until Retry), another
   * run is still live, the Page is disconnected, or an ON would have no running
   * automation behind it.
   */
  private async createRunIfDue(
    settings: AiHandoverSettingsModel,
    inboxStatus: string,
    tx: Parameters<typeof aiHandoverBulkRunRepository.findByRevision>[1],
  ): Promise<AiHandoverBulkRunModel | null> {
    const { workspaceId, inboxId, applyToAllRevision: revision } = settings
    if (revision === 0 || inboxStatus !== inboxStatuses.enum.connected) {
      return null
    }
    if (
      await aiHandoverBulkRunRepository.findByRevision(
        { workspaceId, inboxId, revision },
        tx,
      )
    ) {
      return null
    }
    const action = settings.applyToAllCustomers ? "enable" : "disable"
    if (
      action === "enable" &&
      !(await aiHandoverSettingsService.isActiveNow(settings))
    ) {
      return null
    }
    // `null` when a live run still holds the Page: the engine reconciles when
    // it stops.
    return await aiHandoverBulkRunRepository.createForRevision(
      {
        workspaceId,
        inboxId,
        channel: settings.channel,
        revision,
        action,
        message: settings.applyToAllMessage,
        requestedByUserId: settings.applyToAllRequestedByUserId,
        requestedAt: new Date(),
      },
      tx,
    )
  }

  /** After a committed change: drop the cached settings, dispatch the new run. */
  private async afterChange(
    inboxId: string,
    run: AiHandoverBulkRunModel | null,
  ): Promise<void> {
    try {
      await aiHandoverSettingsService.invalidate({ inboxId })
    } catch (err) {
      // The change is committed: a cache outage must not skip the dispatch.
      log.warn(
        { err, inboxId },
        "AI hand-over settings cache invalidation failed",
      )
    }
    if (!run) {
      return
    }
    // Best effort: a failed enqueue only delays the run until the sweeper
    // picks the `pending` row up.
    await this.enqueueChunk(run).catch((err) =>
      log.error({ err, runId: run.id }, "ai-handover bulk: enqueue failed"),
    )
  }

  /** The text an OFF sends, or `null` for an ON. */
  private validateMessage(
    input: Pick<SetApplyToAllInput, "applyToAllCustomers" | "message">,
    channel: AiHandoverChannel,
  ): string | null {
    if (input.applyToAllCustomers) {
      return null
    }
    const message = input.message?.trim() ?? ""
    if (!message) {
      throw bulkException(
        AI_HANDOVER_BULK_ERROR_CODES.messageRequired,
        "A message is required",
      )
    }
    if (
      message.length > AI_HANDOVER_CHANNEL_POLICIES[channel].messageMaxLength
    ) {
      throw bulkException(
        AI_HANDOVER_BULK_ERROR_CODES.messageTooLong,
        "The message is too long",
      )
    }
    return message
  }

  /**
   * Dispatches one chunk job. The id carries the sweeper attempt and the
   * continuation revision, so a re-dispatch or a continuation is a distinct
   * job while a duplicate dispatch of the same chunk collapses.
   */
  async enqueueChunk(
    run: AiHandoverBulkChunkRef,
    options: { delayMs?: number } = {},
  ): Promise<void> {
    await integrationQueue.add(
      IntegrationJobAction.aiHandoverBulkToggle,
      {
        type: IntegrationJobAction.aiHandoverBulkToggle,
        data: { runId: run.id, workspaceId: run.workspaceId },
      },
      {
        jobId: buildAiHandoverBulkJobId({
          runId: run.id,
          chunkSeq: run.chunkSeq,
        }),
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: { count: 100 },
        ...(options.delayMs && { delay: options.delayMs }),
      },
    )
  }

  /**
   * Sweeper: whether the dispatch before the one `pickDue` just made is still
   * in the queue (waiting or delayed). The integration queue is shared
   * with every webhook, so it can lag by minutes: such a run is not stuck, and
   * re-dispatching it would only burn its retry budget until it is failed. The
   * attempt is given back; `false` means the job is gone and the run must be
   * dispatched again. A queue that cannot be asked counts as gone.
   */
  async refundIfPreviousChunkQueued(
    run: AiHandoverBulkChunkRef & Pick<AiHandoverBulkRunModel, "status">,
  ): Promise<boolean> {
    // A cancelling run must be wound down now: its previous chunk may be a
    // delayed quota continuation that would keep it alive for hours.
    if (run.status === "cancelling") {
      return false
    }
    try {
      const previous = await integrationQueue.getJob(
        buildAiHandoverBulkJobId({
          runId: run.id,
          chunkSeq: run.chunkSeq - 1,
        }),
      )
      if (
        !(previous && QUEUED_JOB_STATES.includes(await previous.getState()))
      ) {
        return false
      }
    } catch (err) {
      log.warn({ err, runId: run.id }, "could not look up the queued chunk job")
      return false
    }
    await aiHandoverBulkRunRepository.refundDispatch({
      runId: run.id,
      attempts: run.attempts,
      chunkSeq: run.chunkSeq,
    })
    return true
  }

  // Engine / sweeper surface: the worker may not call the repository itself.

  /** The run's Page, as the engine needs it; `null` when it no longer exists. */
  async findRunInbox(
    run: Pick<AiHandoverBulkRunModel, "workspaceId" | "inboxId">,
  ): Promise<BulkRunInbox | null> {
    const inbox = await inboxService.find({
      where: { id: run.inboxId, workspaceId: run.workspaceId },
    })
    const channel = inbox ? parseAiHandoverChannel(inbox.channel) : null
    return inbox && channel
      ? {
          id: inbox.id,
          channel,
          threadControlSeenAt: inbox.threadControlSeenAt,
        }
      : null
  }

  /** Threads of the run's Page the run acts on, after `afterId` (keyset). */
  listEligiblePage(input: {
    run: AiHandoverBulkRunModel
    afterId: string | null
    limit: number
    now: Date
  }) {
    return contactInboxRepository.listBulkAiPage({
      ...eligibilityOf(input.run, input.now),
      workspaceId: input.run.workspaceId,
      inboxId: input.run.inboxId,
      afterId: input.afterId,
      limit: input.limit,
    })
  }

  /** Of `ids`, those the run still acts on (the pre-dispatch re-check). */
  listStillEligible(input: {
    run: AiHandoverBulkRunModel
    ids: string[]
    now: Date
  }) {
    return contactInboxRepository.listStillBulkAiEligible({
      ...eligibilityOf(input.run, input.now),
      workspaceId: input.run.workspaceId,
      ids: input.ids,
    })
  }

  /** Threads the run acts on after `afterId` (the whole Page when absent). */
  countEligible(input: {
    run: AiHandoverBulkRunModel
    afterId?: string | null
    now: Date
  }) {
    return contactInboxRepository.countBulkAiEligible({
      ...eligibilityOf(input.run, input.now),
      workspaceId: input.run.workspaceId,
      inboxId: input.run.inboxId,
      afterId: input.afterId ?? null,
    })
  }

  /** Pages whose latest revision still has no run: the sweeper reconciles them. */
  listInboxesAwaitingRun(input: {
    limit: number
    afterInboxId?: string | null
  }) {
    return aiHandoverBulkRunRepository.listInboxesAwaitingRun(input)
  }

  claim(input: { runId: string; workspaceId: string }) {
    return aiHandoverBulkRunRepository.claim(input)
  }

  recordProgress(input: {
    runId: string
    expect: AiHandoverBulkRunGuard
    progress: AiHandoverBulkRunProgressInput
  }) {
    return aiHandoverBulkRunRepository.recordProgress(input)
  }

  yieldForContinuation(input: {
    runId: string
    expect: AiHandoverBulkRunGuard
    pausedUntil?: Date
  }) {
    return aiHandoverBulkRunRepository.yieldForContinuation(input)
  }

  finish(input: {
    runId: string
    expect: AiHandoverBulkRunGuard
    outcome: FinishAiHandoverBulkRunInput
  }) {
    return aiHandoverBulkRunRepository.finish(input)
  }

  reopenReleased(runId: string) {
    return aiHandoverBulkRunRepository.reopenReleased({ runId })
  }

  markMaxAttemptsFailed() {
    return aiHandoverBulkRunRepository.markMaxAttemptsFailed({
      maxAttempts: AI_HANDOVER_BULK_MAX_ATTEMPTS,
    })
  }

  pickDue(input: { batchSize: number }) {
    return aiHandoverBulkRunRepository.pickDue({
      ...input,
      maxAttempts: AI_HANDOVER_BULK_MAX_ATTEMPTS,
    })
  }
}

export const aiHandoverBulkRunService = new AiHandoverBulkRunService()
