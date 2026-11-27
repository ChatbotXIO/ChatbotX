import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
} from "@chatbotx.io/database/client"
import type {
  ChannelType,
  ContactSyncProvider,
  ContactSyncTriggerSource,
} from "@chatbotx.io/database/partials"
import {
  type ContactSyncItemCounters,
  type ContactSyncRunGuard,
  type ContactSyncRunItemInput,
  coexistSyncRunRepository,
  contactSyncMappingRepository,
  contactSyncRunRepository,
  type FinishContactSyncRunResult,
} from "@chatbotx.io/database/repositories"
import { tagModel } from "@chatbotx.io/database/schema"
import type {
  ContactSyncRunItemModel,
  ContactSyncRunModel,
} from "@chatbotx.io/database/types"
import { getChildLogger } from "@chatbotx.io/logger"
import { BaseService } from "../base.service"
import { workspaceService } from "../workspace/service"
import {
  type ContactSyncAvailability,
  resolveContactSyncAvailability,
} from "./availability"
import {
  type ScheduleConnectImportInput,
  scheduleContactSyncConnectImport,
} from "./connect-import"
import {
  CONTACT_SYNC_ERROR_CODES,
  CONTACT_SYNC_MAX_ATTEMPTS,
  CONTACT_SYNC_RUN_ERRORS,
  CONTACT_SYNC_SWEEP_BATCH_SIZE,
  type ContactSyncFollowUpChannel,
  isContactSyncFollowUpChannel,
} from "./constants"
import {
  discoverContactSyncPages,
  discoveryKey,
  pageOfInbox,
} from "./discovery"
import {
  assertContactSyncAvailable,
  ContactSyncMappingError,
  contactSyncAlreadyRunningError,
  contactSyncException,
} from "./errors"
import { externalFieldTypeTargets, isCompatibleFieldType } from "./field-type"
import {
  handOffContactSyncFollowUp,
  sweepContactSyncFollowUps,
} from "./follow-up"
import type { ContactSyncImportContext } from "./import-page"
import { loadContactSyncMappingState, loadCustomFieldsByIds } from "./mapping"
import {
  type ContactSyncFieldMappingInput,
  type ContactSyncTagMappingInput,
  planContactSyncMappings,
} from "./mapping-input"
import { findContactSyncPagesAtSource } from "./picker-discovery"
import { contactSyncAdapters } from "./providers"
import { contactSyncChunkJobState, enqueueContactSyncChunk } from "./queue"
import { lockWorkspaceRuns } from "./run-lock"
import { settleRunOutcome } from "./run-outcome"
import {
  type ContactSyncInbox,
  findContactSyncInboxes,
  listContactSyncInboxes,
} from "./source-inboxes"
import {
  assertSourceEligible,
  assertSourceListShape,
  type ContactSyncSource,
  toMappingPage,
  toSource,
} from "./sources"
import type {
  ContactSyncActor,
  ContactSyncAdapter,
  ContactSyncPage,
  ContactSyncRequestScope,
} from "./types"

export type { ContactSyncSource } from "./sources"

const log = getChildLogger("contact-sync")

/** The one provider today; a second one is a new adapter and a new value here. */
const DEFAULT_PROVIDER: ContactSyncProvider = "ahachat"

const adapterFor = (provider: ContactSyncProvider) =>
  contactSyncAdapters[provider]

export type ScheduleContactSyncInput = {
  workspaceId: string
  actor: ContactSyncActor
  triggerSource: ContactSyncTriggerSource
  sources: { inboxId: string }[]
  syncTags: boolean
  syncCustomFields: boolean
  overwriteExisting: boolean
}

/** What a chunk needs to know about the workspace, read once per chunk. */
export type ContactSyncWorkerContext = ContactSyncImportContext

type ResolvedRunSource = ContactSyncRunItemInput

class ContactSyncService extends BaseService {
  /** Whether the sync is configured on this deployment; unconfigured, it is hidden. */
  isConfigured(provider: ContactSyncProvider = DEFAULT_PROVIDER): boolean {
    return adapterFor(provider).isConfigured()
  }

  /** See `findContactSyncPagesAtSource` (the connect picker). */
  findPagesAtSource(input: {
    workspaceId: string
    actor: ContactSyncActor
    pages: ContactSyncPage[]
    provider?: ContactSyncProvider
  }): Promise<string[]> {
    const provider = input.provider ?? DEFAULT_PROVIDER
    if (!this.isConfigured(provider)) {
      return Promise.resolve([])
    }
    return findContactSyncPagesAtSource({ ...input, provider })
  }

  /**
   * Every connected page of the workspace on a supported channel, with
   * whether the source has it. The source is asked in bounded batches of
   * deduped pairs; a batch that fails leaves its pages `unavailable` (retry),
   * never `absent`.
   */
  async listSources(input: {
    workspaceId: string
    actor: ContactSyncActor
    provider?: ContactSyncProvider
  }): Promise<ContactSyncSource[]> {
    const provider = input.provider ?? DEFAULT_PROVIDER
    const inboxes = await listContactSyncInboxes(input.workspaceId)
    const found = await this.discover({ ...input, provider }, inboxes)
    return inboxes.map((inbox) =>
      toSource(provider, inbox, found.get(discoveryKey(pageOfInbox(inbox)))),
    )
  }

  /** The source's tags and fields with what each one maps to now. */
  async getSchema(input: {
    workspaceId: string
    actor: ContactSyncActor
    inboxId: string
  }) {
    const { source, scope, page } = await this.findSourceOrFail(input)
    const schema = await adapterFor(source.provider).listSchema(scope, page)
    const state = await loadContactSyncMappingState(
      {
        workspaceId: input.workspaceId,
        page: toMappingPage(source.provider, page),
      },
      schema,
    )
    const [tagNames, fieldsById] = await Promise.all([
      this.findTagNames(
        input.workspaceId,
        [...state.tags.values()].map((tag) => tag.tagId),
      ),
      loadCustomFieldsByIds(
        input.workspaceId,
        [...state.fields.values()].map((field) => field.customFieldId),
      ),
    ])
    return {
      source,
      tags: schema.tags.map((tag) => {
        const mapped = state.tags.get(tag.id)
        return {
          id: tag.id,
          name: tag.name,
          mapping: mapped
            ? {
                tagId: mapped.tagId,
                tagName: tagNames.get(mapped.tagId) ?? null,
                origin: mapped.origin,
              }
            : null,
        }
      }),
      fields: schema.fields.map((field) => {
        const mapped = state.fields.get(field.id)
        return {
          id: field.id,
          name: field.name,
          type: field.type,
          defaultTargetType: externalFieldTypeTargets[field.type].default,
          compatibleTargetTypes: [
            ...externalFieldTypeTargets[field.type].compatible,
          ],
          mapping: mapped
            ? {
                customFieldId: mapped.customFieldId,
                customFieldName:
                  fieldsById.get(mapped.customFieldId)?.name ?? null,
                customFieldType: mapped.type,
                origin: mapped.origin,
                typeMismatch: !isCompatibleFieldType(field.type, mapped.type),
              }
            : null,
        }
      }),
    }
  }

  /**
   * Saves the user's tag/field mappings of one page. Every row is checked
   * first (`planContactSyncMappings`); any invalid row rejects the whole call
   * with a `ContactSyncMappingError` listing each problem.
   */
  async saveMappings(input: {
    workspaceId: string
    actor: ContactSyncActor
    inboxId: string
    tags?: ContactSyncTagMappingInput[]
    fields?: ContactSyncFieldMappingInput[]
  }): Promise<void> {
    const { source, scope, page } = await this.findSourceOrFail(input)
    const plan = await planContactSyncMappings({
      workspaceId: input.workspaceId,
      schema: await adapterFor(source.provider).listSchema(scope, page),
      tags: input.tags ?? [],
      fields: input.fields ?? [],
    })
    if (plan.issues.length > 0) {
      throw new ContactSyncMappingError(plan.issues)
    }
    const mappingScope = {
      workspaceId: input.workspaceId,
      page: toMappingPage(source.provider, page),
    }
    await db.transaction(async (tx) => {
      await contactSyncMappingRepository.upsertManual(
        { ...mappingScope, rows: plan.upserts },
        tx,
      )
      await contactSyncMappingRepository.deleteByExternalIds(
        { ...mappingScope, kind: "tag", externalIds: plan.tagRemovals },
        tx,
      )
      await contactSyncMappingRepository.deleteByExternalIds(
        {
          ...mappingScope,
          kind: "customField",
          externalIds: plan.fieldRemovals,
        },
        tx,
      )
    })
  }

  async getAvailability(input: {
    workspaceId: string
    now?: Date
    tx?: DatabaseClient
  }): Promise<ContactSyncAvailability> {
    const tx = input.tx ?? db
    const [live, latest] = await Promise.all([
      contactSyncRunRepository.findLive(input.workspaceId, tx),
      contactSyncRunRepository.findLatestFetchedRun(input.workspaceId, tx),
    ])
    return resolveContactSyncAvailability({
      liveRunId: live?.id ?? null,
      latestFetchedRunCreatedAt: latest?.createdAt ?? null,
      now: input.now ?? new Date(),
    })
  }

  /**
   * Starts a Contacts-menu sync. Pages are validated first (connected, on a
   * supported channel, found at the source); then, under a per-workspace
   * transaction lock, availability is re-read and the run inserted, so two
   * requests right after the cooldown cannot both start one (the live unique
   * index is the second barrier). The first chunk is enqueued after commit.
   */
  async schedule(input: ScheduleContactSyncInput) {
    const provider = DEFAULT_PROVIDER
    this.assertConfigured(provider)
    assertSourceListShape(input.sources)
    const items = await this.resolveMenuSources(input, provider)
    const run = await db.transaction(async (tx) => {
      await lockWorkspaceRuns(tx, input.workspaceId)
      assertContactSyncAvailable(
        await this.getAvailability({ workspaceId: input.workspaceId, tx }),
      )
      const created = await contactSyncRunRepository.createWithItems(
        {
          workspaceId: input.workspaceId,
          provider,
          triggerSource: input.triggerSource,
          trigger: "menu",
          requestedByType: input.actor.type,
          requestedById: input.actor.id,
          syncTags: input.syncTags,
          syncCustomFields: input.syncCustomFields,
          overwriteExisting: input.overwriteExisting,
          items,
        },
        tx,
      )
      if (!created) {
        // Lost to a run committed after the re-read: report that run.
        const live = await contactSyncRunRepository.findLive(
          input.workspaceId,
          tx,
        )
        throw contactSyncAlreadyRunningError(live?.id ?? null)
      }
      return created
    })
    // Best effort: a failed enqueue only delays the run until the sweeper.
    await this.enqueueChunk(run).catch((err) =>
      log.error({ err, runId: run.id }, "contact sync: enqueue failed"),
    )
    return run
  }

  async get(input: { workspaceId: string; runId: string }) {
    const run = await contactSyncRunRepository.findForWorkspace(input)
    if (!run) {
      throw contactSyncException(
        CONTACT_SYNC_ERROR_CODES.runNotFound,
        "Contact sync not found",
        404,
      )
    }
    return run
  }

  listHistory(input: { workspaceId: string; page?: number; perPage?: number }) {
    return contactSyncRunRepository.listHistory(input)
  }

  /** Idempotent: a run that already finished reports `cancelled: false`. */
  async cancel(input: { workspaceId: string; runId: string }) {
    await this.get(input)
    const run = await contactSyncRunRepository.cancelLive(input)
    return { cancelled: run !== null }
  }

  /**
   * Cancels the open items of a page that is going away (disconnect, inbox
   * removal) and every follow-up it still owes, so a later reconnect never
   * starts a history sync the user did not ask for. The run goes on with its
   * other items. `lock` names the page's channel integration for Messenger and
   * Instagram: its row is locked first, the order a handoff and a connect take
   * (integration row, then item rows), so a teardown cannot deadlock with them.
   */
  async cancelForInbox(
    input: {
      workspaceId: string
      inboxId: string
      lock?: { channel: ContactSyncFollowUpChannel; integrationId: string }
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    if (input.lock) {
      await coexistSyncRunRepository.lockIntegration({
        channel: input.lock.channel,
        workspaceId: input.workspaceId,
        integrationId: input.lock.integrationId,
        tx,
      })
    }
    await contactSyncRunRepository.cancelForInbox(
      { workspaceId: input.workspaceId, inboxId: input.inboxId },
      tx,
    )
  }

  /** The contacts-first import at page connect (see `scheduleContactSyncConnectImport`). */
  scheduleConnectImport(input: ScheduleConnectImportInput) {
    return scheduleContactSyncConnectImport(input)
  }

  /**
   * Hands one closed import item off to the history sync; the engine calls
   * it after the item ended, the sweep for what it missed.
   */
  handOffFollowUp(itemId: string) {
    return handOffContactSyncFollowUp(itemId)
  }

  sweepFollowUps() {
    return sweepContactSyncFollowUps()
  }

  /**
   * Retry-history: re-opens the follow-up of a page whose handoff failed and
   * restarts its 24 h window; the sweep then hands it off. Only while the
   * page is still connected.
   */
  async retryHistory(input: {
    workspaceId: string
    inboxId: string
  }): Promise<{ reopened: boolean }> {
    const [inbox] = await findContactSyncInboxes(input.workspaceId, [
      input.inboxId,
    ])
    if (!inbox) {
      throw contactSyncException(
        CONTACT_SYNC_ERROR_CODES.sourceNotFound,
        "Page not found or not connected",
        404,
      )
    }
    if (!isContactSyncFollowUpChannel(inbox.channel)) {
      return { reopened: false }
    }
    const { channel } = inbox
    // One transaction under the integration lock a disconnect takes: a
    // disconnect that committed first removed the integration (nothing to
    // reopen), one that comes after waits, then cancels what was reopened.
    return await db.transaction(async (tx) => {
      const integrationId =
        await coexistSyncRunRepository.findIntegrationIdByInbox({
          channel,
          workspaceId: input.workspaceId,
          inboxId: input.inboxId,
          tx,
        })
      if (!integrationId) {
        return { reopened: false }
      }
      await coexistSyncRunRepository.lockIntegration({
        channel,
        workspaceId: input.workspaceId,
        integrationId,
        tx,
      })
      const reopened = await contactSyncRunRepository.reopenFollowUp(input, tx)
      return { reopened: reopened > 0 }
    })
  }

  // ── Engine / sweeper surface: the worker may not call repositories itself.

  enqueueChunk(
    run: Pick<ContactSyncRunModel, "id" | "workspaceId" | "chunkSeq">,
    options: { delayMs?: number } = {},
  ): Promise<void> {
    return enqueueContactSyncChunk(run, options)
  }

  /**
   * Sweeper: whether the dispatch before the one `pickDue` just made is
   * still queued (the shared queue can lag); if so the attempt is given back.
   */
  async refundIfPreviousChunkQueued(
    run: Pick<ContactSyncRunModel, "id" | "attempts" | "chunkSeq" | "status">,
  ): Promise<boolean> {
    if (run.status === "cancelling") {
      return false
    }
    if (
      (await contactSyncChunkJobState(run.id, run.chunkSeq - 1)) !== "waiting"
    ) {
      return false
    }
    await contactSyncRunRepository.refundDispatch({
      runId: run.id,
      attempts: run.attempts,
      chunkSeq: run.chunkSeq,
    })
    return true
  }

  /** The workspace data every normalizer and the quota need, read once per chunk. */
  async loadWorkerContext(
    workspaceId: string,
  ): Promise<ContactSyncWorkerContext | null> {
    const workspace = await workspaceService.find({
      where: { id: workspaceId },
    })
    if (!workspace) {
      return null
    }
    return {
      workspaceId,
      ownerId: workspace.ownerId,
      targetCountry: workspace.targetCountry,
      workspaceTimezone: workspace.timezone,
    }
  }

  /** The request scope of a run's background calls: its immutable actor snapshot. */
  scopeOfRun(
    run: Pick<
      ContactSyncRunModel,
      "workspaceId" | "requestedByType" | "requestedById"
    >,
  ): ContactSyncRequestScope {
    return {
      workspaceId: run.workspaceId,
      actor: { type: run.requestedByType, id: run.requestedById },
    }
  }

  /** The item's inbox, still connected; `null` when it is gone. */
  async findItemInbox(
    item: Pick<ContactSyncRunItemModel, "workspaceId" | "inboxId">,
  ): Promise<{ id: string; channel: ChannelType } | null> {
    if (!item.inboxId) {
      return null
    }
    const inbox = await db.query.inboxModel.findFirst({
      where: {
        id: item.inboxId,
        workspaceId: item.workspaceId,
        status: "connected",
      },
      columns: { id: true, channel: true },
    })
    if (!inbox) {
      return null
    }
    return { id: inbox.id, channel: inbox.channel as ChannelType }
  }

  adapterFor(provider: ContactSyncProvider): ContactSyncAdapter {
    return adapterFor(provider)
  }

  claim(input: { runId: string; workspaceId: string }) {
    return contactSyncRunRepository.claim(input)
  }

  renewLease(input: { runId: string; expect: ContactSyncRunGuard }) {
    return contactSyncRunRepository.renewLease(input)
  }

  findNextItem(runId: string) {
    return contactSyncRunRepository.findNextItem(runId)
  }

  startItem(input: {
    runId: string
    itemId: string
    expect: ContactSyncRunGuard
    upperBoundId: string | null
  }) {
    return contactSyncRunRepository.startItem(input)
  }

  recordItemProgress(input: {
    runId: string
    itemId: string
    expect: ContactSyncRunGuard
    cursor: string | null
    counters: ContactSyncItemCounters
  }) {
    return contactSyncRunRepository.recordItemProgress(input)
  }

  finishItem(input: Parameters<typeof contactSyncRunRepository.finishItem>[0]) {
    return contactSyncRunRepository.finishItem(input)
  }

  yieldForContinuation(input: {
    runId: string
    expect: ContactSyncRunGuard
    pausedUntil?: Date
    countAttempt?: boolean
  }) {
    return contactSyncRunRepository.yieldForContinuation(input)
  }

  /**
   * Ends the run from its items: all succeeded → `succeeded`; none
   * succeeded or partial → `failed`; otherwise `partial`. A cancel wins.
   */
  async finish(input: {
    run: Pick<ContactSyncRunModel, "id" | "status">
    expect: ContactSyncRunGuard
  }): Promise<FinishContactSyncRunResult> {
    const statuses = await contactSyncRunRepository.listItemStatuses(
      input.run.id,
    )
    return await contactSyncRunRepository.finish({
      runId: input.run.id,
      expect: input.expect,
      outcome: settleRunOutcome(input.run.status, statuses),
      closeOpen: input.run.status === "cancelling",
    })
  }

  reopenReleased(runId: string) {
    return contactSyncRunRepository.reopenReleased({ runId })
  }

  /**
   * Ends at most one batch of exhausted runs per sweep
   * (`CONTACT_SYNC_SWEEP_BATCH_SIZE`). Only a run whose last dispatched
   * chunk is known to be settled ends: one still waiting in a backed-up queue
   * (or running) is left for that chunk, and one whose queue could not be read
   * is checked again on the next sweep, so neither costs it its last retry.
   * A cancelled run is ended either way.
   */
  async markMaxAttemptsFailed(): Promise<number> {
    const exhausted = await contactSyncRunRepository.listExhausted({
      maxAttempts: CONTACT_SYNC_MAX_ATTEMPTS,
      batchSize: CONTACT_SYNC_SWEEP_BATCH_SIZE,
    })
    const endable = await Promise.all(
      exhausted.map(async (run) => {
        if (run.status === "cancelling") {
          return true
        }
        return (
          (await contactSyncChunkJobState(run.id, run.chunkSeq)) === "settled"
        )
      }),
    )
    return await contactSyncRunRepository.markMaxAttemptsFailed({
      maxAttempts: CONTACT_SYNC_MAX_ATTEMPTS,
      errorCode: CONTACT_SYNC_RUN_ERRORS.maxAttempts,
      runIds: exhausted
        .filter((_run, index) => endable[index])
        .map((run) => run.id),
    })
  }

  pickDue(input: { batchSize: number }) {
    return contactSyncRunRepository.pickDue({
      ...input,
      maxAttempts: CONTACT_SYNC_MAX_ATTEMPTS,
    })
  }

  // ── Internals

  /** Where the run's chunk job `chunkSeq` stands in the queue. */
  /** Asks the source about the inboxes' pages (see `discoverContactSyncPages`). */
  private discover(
    input: {
      workspaceId: string
      actor: ContactSyncActor
      provider: ContactSyncProvider
    },
    inboxes: ContactSyncInbox[],
  ) {
    return discoverContactSyncPages({
      provider: input.provider,
      scope: { workspaceId: input.workspaceId, actor: input.actor },
      inboxes,
    })
  }

  private assertConfigured(provider: ContactSyncProvider): void {
    if (!this.isConfigured(provider)) {
      throw contactSyncException(
        CONTACT_SYNC_ERROR_CODES.notConfigured,
        "The AhaChat sync is not configured",
        503,
      )
    }
  }

  /** One page of the workspace as a source, found at the source or refused. */
  private async findSourceOrFail(input: {
    workspaceId: string
    actor: ContactSyncActor
    inboxId: string
  }): Promise<{
    source: ContactSyncSource
    scope: ContactSyncRequestScope
    page: ContactSyncPage
  }> {
    this.assertConfigured(DEFAULT_PROVIDER)
    const [inbox] = await findContactSyncInboxes(input.workspaceId, [
      input.inboxId,
    ])
    if (!inbox) {
      throw contactSyncException(
        CONTACT_SYNC_ERROR_CODES.sourceNotFound,
        `Source ${input.inboxId} not found`,
        404,
      )
    }
    const found = await this.discover(
      { ...input, provider: DEFAULT_PROVIDER },
      [inbox],
    )
    const source = toSource(
      DEFAULT_PROVIDER,
      inbox,
      found.get(discoveryKey(pageOfInbox(inbox))),
    )
    assertSourceEligible(source)
    return {
      source,
      scope: { workspaceId: input.workspaceId, actor: input.actor },
      page: pageOfInbox(inbox),
    }
  }

  /** Validates the requested pages of a menu sync and builds its items. */
  private async resolveMenuSources(
    input: ScheduleContactSyncInput,
    provider: ContactSyncProvider,
  ): Promise<ResolvedRunSource[]> {
    const inboxes = await findContactSyncInboxes(
      input.workspaceId,
      input.sources.map((source) => source.inboxId),
    )
    const byId = new Map(inboxes.map((inbox) => [inbox.id, inbox]))
    const ordered = input.sources.map((requested) => {
      const inbox = byId.get(requested.inboxId)
      if (!inbox) {
        throw contactSyncException(
          CONTACT_SYNC_ERROR_CODES.sourceNotFound,
          `Source ${requested.inboxId} not found`,
          404,
        )
      }
      return inbox
    })
    const found = await this.discover(
      { workspaceId: input.workspaceId, actor: input.actor, provider },
      ordered,
    )
    return ordered.map((inbox) => {
      const source = toSource(
        provider,
        inbox,
        found.get(discoveryKey(pageOfInbox(inbox))),
      )
      assertSourceEligible(source)
      return {
        inboxId: inbox.id,
        sourceChannel: inbox.channel,
        sourceAccountId: inbox.sourceId,
        sourceAccountName: source.sourceName ?? inbox.name,
        followUpCoexist: false,
        followUpAiReadsSyncedHistory: false,
      }
    })
  }

  /** Names of the workspace's tags among `ids`, by id. */
  private async findTagNames(
    workspaceId: string,
    ids: string[],
  ): Promise<Map<string, string>> {
    if (ids.length === 0) {
      return new Map()
    }
    const rows = await db
      .select({ id: tagModel.id, name: tagModel.name })
      .from(tagModel)
      .where(
        and(
          eq(tagModel.workspaceId, workspaceId),
          inArray(tagModel.id, [...new Set(ids)]),
        ),
      )
    return new Map(rows.map((row) => [row.id, row.name] as const))
  }
}

export const contactSyncService = new ContactSyncService()
