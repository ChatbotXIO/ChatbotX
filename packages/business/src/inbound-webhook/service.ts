import {
  INBOUND_WEBHOOK_LIMITS,
  type InboundWebhookAction,
  type InboundWebhookFieldMapping,
  type InboundWebhookIdentifier,
  type InboundWebhookInboxResolution,
  type InboundWebhookRequestStatus,
  inboundWebhookRequestStatuses,
} from "@chatbotx.io/database/partials"
import {
  checkpointInboundWebhookRequest,
  claimInboundWebhookRequest,
  completeInboundWebhookRequest,
  countInboundWebhooks,
  deleteInboundWebhooks,
  failAbandonedInboundWebhookRequests,
  findInboundWebhookById,
  findInboundWebhookIntakeByToken,
  findInboundWebhookRequest,
  type InboundWebhookIntake,
  type InboundWebhookListRow,
  type InboundWebhookRequestCompletion,
  type InboundWebhookRequestListRow,
  type InboundWebhookRequestProgress,
  insertInboundWebhook,
  insertInboundWebhookRequest,
  listInboundWebhookRequestsPaginated,
  listInboundWebhooksPaginated,
  listStaleInboundWebhookRequests,
  type PurgeInboundWebhookRequestsOptions,
  purgeInboundWebhookRequests,
  releaseInboundWebhookRequest,
  updateInboundWebhook,
} from "@chatbotx.io/database/repositories"
import type {
  InboundWebhookModel,
  InboundWebhookRequestModel,
} from "@chatbotx.io/database/types"
import { distributedLock, withCache } from "@chatbotx.io/redis"
import { sha256Hex } from "@chatbotx.io/utils/crypto"
import { BaseService } from "../base.service"
import { customFieldService } from "../custom-field/service"
import { notFoundException, validationException } from "../errors"
import { generateInboundWebhookToken } from "../workspace-api-token/credentials"
import { actionReferencesExistInWorkspace } from "./action-references"
import {
  resolveEffectiveChannel,
  validateInboundWebhookConfig,
} from "./effective-channel"
import {
  classifyMappedTarget,
  type ExtractedInboundWebhookValues,
  extractInboundWebhookValues,
} from "./extract"
import {
  customFieldTargetIds,
  loadExtractionContext,
} from "./extraction-context"

const CREATE_LOCK_TIMEOUT_SECONDS = 10
const CONFIG_LOCK_TIMEOUT_SECONDS = 10
// Short on purpose: the route reads this on every delivery, and a deactivated,
// deleted or regenerated token must stop working quickly even when a delivery
// in flight re-caches the old row just after invalidation (cache-aside has no
// write ordering). Bounds that window at one cheap indexed read per token.
const TOKEN_CACHE_TTL_SECONDS = 10
/** A worker that stops checkpointing for this long loses its claim. */
const CLAIM_LEASE_MS = 15 * 60 * 1000
/** A `received` request still unclaimed after this long was never enqueued, or its job was lost. */
const UNCLAIMED_REQUEST_GRACE_MS = 2 * 60 * 1000
/** Re-dispatch stops retrying a request this old; the next cron run closes it as abandoned. */
const REDISPATCH_MAX_AGE_MS = 24 * 60 * 60 * 1000

const webhookTag = (id: string) => `inbound-webhooks:${id}`

export type InboundWebhookConfigInput = {
  inboxResolution: InboundWebhookInboxResolution | null
  identifiers: InboundWebhookIdentifier[]
  fieldMappings: InboundWebhookFieldMapping[]
  actions: InboundWebhookAction[]
  sampleJson: unknown
}

/** Where a delivery came from; stored for tracing, never exposed. */
export type InboundWebhookClientInfo = {
  clientIp: string | null
  userAgent: string | null
}

export type RecordRequestResult =
  | { duplicate: true }
  | { duplicate: false; request: InboundWebhookRequestModel }

type Paged<T> = { data: T[]; pageCount: number }

class InboundWebhookService extends BaseService {
  async create(input: {
    workspaceId: string
    name: string
  }): Promise<InboundWebhookModel> {
    const { workspaceId, name } = input
    const created = await distributedLock.runExclusive({
      key: `inbound-webhook:${workspaceId}`,
      timeoutInSeconds: CREATE_LOCK_TIMEOUT_SECONDS,
      retryTimeoutInSeconds: CREATE_LOCK_TIMEOUT_SECONDS,
      fn: async () => {
        const count = await countInboundWebhooks(workspaceId)
        if (count >= INBOUND_WEBHOOK_LIMITS.maxWebhooksPerWorkspace) {
          throw validationException("_", "validation.maxItemsReached", {
            max: INBOUND_WEBHOOK_LIMITS.maxWebhooksPerWorkspace,
            feature: "inboundWebhooks",
          })
        }
        // Explicit values for every jsonb column: a drizzle `.default()` is not
        // a database default (AGENTS.md).
        return await insertInboundWebhook({
          workspaceId,
          name,
          token: generateInboundWebhookToken(),
          inboxResolution: null,
          identifiers: [],
          fieldMappings: [],
          actions: [],
          sampleJson: null,
        })
      },
    })
    await this.audit("create", `created a new inbound webhook (#${created.id})`)
    return created
  }

  async list(input: {
    workspaceId: string
    page: number
    perPage: number
  }): Promise<Paged<InboundWebhookListRow>> {
    const { rows, total } = await listInboundWebhooksPaginated({
      workspaceId: input.workspaceId,
      limit: input.perPage,
      offset: (input.page - 1) * input.perPage,
    })
    return { data: rows, pageCount: Math.ceil(total / input.perPage) }
  }

  async findOrFail(input: {
    workspaceId: string
    id: string
  }): Promise<InboundWebhookModel> {
    const webhook = await findInboundWebhookById(input)
    if (!webhook) {
      throw notFoundException("Inbound webhook not found")
    }
    return webhook
  }

  /**
   * The delivery hot path. Cached in Redis for a few seconds and invalidated on
   * every change; the entry is the four-field intake, not the row. One entry and
   * its tag set per webhook (at most 100 per workspace), never per contact or per delivery, and
   * no in-process copy: memory use does not grow with traffic.
   */
  async findByToken(token: string): Promise<InboundWebhookIntake | null> {
    // The key is logged when the cache misbehaves, so it carries a digest, never
    // the token. "intake" names the cached shape: entries written by an older
    // build (the whole row) live under another key and are never misread.
    const tokenDigest = await sha256Hex(token)
    return await withCache(
      `inbound-webhooks:intake:${tokenDigest}`,
      () => findInboundWebhookIntakeByToken(token),
      {
        ttl: TOKEN_CACHE_TTL_SECONDS,
        dynamicTags: (webhook) =>
          webhook ? [webhookTag(webhook.id)] : undefined,
      },
    )
  }

  /**
   * Saving a config and activating the webhook both validate against the row
   * they read, so they run one at a time per webhook: otherwise a draft save
   * could land between an activation's check and its write and leave an active
   * webhook with an incomplete config.
   */
  update(
    input: { workspaceId: string; id: string } & InboundWebhookConfigInput,
  ): Promise<InboundWebhookModel> {
    return this.withConfigLock(input.id, () => this.applyUpdate(input))
  }

  updateSettings(input: {
    workspaceId: string
    id: string
    name?: string
    active?: boolean
  }): Promise<InboundWebhookModel> {
    return this.withConfigLock(input.id, () => this.applySettings(input))
  }

  private withConfigLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    return distributedLock.runExclusive({
      key: `inbound-webhook-config-${id}`,
      timeoutInSeconds: CONFIG_LOCK_TIMEOUT_SECONDS,
      retryTimeoutInSeconds: CONFIG_LOCK_TIMEOUT_SECONDS,
      fn,
    })
  }

  private async applyUpdate(
    input: { workspaceId: string; id: string } & InboundWebhookConfigInput,
  ): Promise<InboundWebhookModel> {
    const { workspaceId, id, ...config } = input
    await this.findOrFail({ workspaceId, id })

    await this.assertConfigValid({ workspaceId, ...config })
    await this.assertReferencesExist({ workspaceId, ...config })

    const updated = await updateInboundWebhook({
      id,
      workspaceId,
      set: config,
    })
    if (!updated) {
      throw notFoundException("Inbound webhook not found")
    }
    await this.invalidate([id])
    await this.audit("update", `updated inbound webhook (#${id})`)
    return updated
  }

  private async applySettings(input: {
    workspaceId: string
    id: string
    name?: string
    active?: boolean
  }): Promise<InboundWebhookModel> {
    const { workspaceId, id, name, active } = input
    const existing = await this.findOrFail({ workspaceId, id })
    if (name === undefined && active === undefined) {
      return existing
    }
    if (active === true && !existing.active) {
      await this.assertConfigValid({
        workspaceId,
        inboxResolution: existing.inboxResolution,
        identifiers: existing.identifiers,
        fieldMappings: existing.fieldMappings,
      })
    }
    const updated = await updateInboundWebhook({
      id,
      workspaceId,
      set: {
        ...(name === undefined ? {} : { name }),
        ...(active === undefined ? {} : { active }),
      },
    })
    if (!updated) {
      throw notFoundException("Inbound webhook not found")
    }
    await this.invalidate([id])
    await this.audit("update", `updated inbound webhook (#${id}) settings`)
    return updated
  }

  /** The old URL stops working within 10 seconds (the token cache TTL): the token is the only credential. */
  async regenerateToken(input: {
    workspaceId: string
    id: string
  }): Promise<InboundWebhookModel> {
    const updated = await updateInboundWebhook({
      id: input.id,
      workspaceId: input.workspaceId,
      set: { token: generateInboundWebhookToken() },
    })
    if (!updated) {
      throw notFoundException("Inbound webhook not found")
    }
    await this.invalidate([input.id])
    await this.audit(
      "update",
      `regenerated the token of inbound webhook (#${input.id})`,
    )
    return updated
  }

  async deleteMany(input: {
    workspaceId: string
    ids: string[]
  }): Promise<void> {
    const deleted = await deleteInboundWebhooks(input)
    if (deleted.length === 0) {
      return
    }
    await this.invalidate(deleted.map(({ id }) => id))
    await this.audit(
      "delete",
      `deleted inbound webhooks (${deleted.map(({ id }) => `#${id}`).join(", ")})`,
    )
  }

  async delete(input: { workspaceId: string; id: string }): Promise<void> {
    const [deleted] = await deleteInboundWebhooks({
      workspaceId: input.workspaceId,
      ids: [input.id],
    })
    if (!deleted) {
      throw notFoundException("Inbound webhook not found")
    }
    await this.invalidate([input.id])
    await this.audit("delete", `deleted inbound webhook (#${input.id})`)
  }

  /** Shows what a delivery of `payload` would do with this configuration; writes nothing. */
  async previewMapping(input: {
    workspaceId: string
    payload: unknown
    inboxResolution: InboundWebhookInboxResolution | null
    identifiers: InboundWebhookIdentifier[]
    fieldMappings: InboundWebhookFieldMapping[]
  }): Promise<ExtractedInboundWebhookValues> {
    const { workspaceId, fieldMappings, inboxResolution } = input
    const [context, effective] = await Promise.all([
      loadExtractionContext({ workspaceId, fieldMappings }),
      inboxResolution
        ? resolveEffectiveChannel({ workspaceId, resolution: inboxResolution })
        : null,
    ])
    return await extractInboundWebhookValues({
      ...input,
      ...context,
      channel: effective?.channel ?? null,
    })
  }

  // ─── Requests ──────────────────────────────────────────────────────────

  /**
   * Stores one accepted delivery, or reports it as a duplicate. Only an
   * `Idempotency-Key` the sender chose dedupes, enforced by a unique index on
   * the row: the same body is a legitimate new delivery (a customer's second
   * order, a re-sent form) and must run its mappings and actions again.
   */
  async recordRequest(input: {
    webhook: Pick<InboundWebhookModel, "id" | "workspaceId">
    payload: unknown
    idempotencyKey: string | null
    clientInfo: InboundWebhookClientInfo
  }): Promise<RecordRequestResult> {
    const { webhook, payload, idempotencyKey, clientInfo } = input
    const request = await insertInboundWebhookRequest({
      workspaceId: webhook.workspaceId,
      inboundWebhookId: webhook.id,
      idempotencyKey,
      clientIp: clientInfo.clientIp,
      userAgent: clientInfo.userAgent,
      payload,
    })
    return request ? { duplicate: false, request } : { duplicate: true }
  }

  async claimRequest(id: string): Promise<{
    request: InboundWebhookRequestModel
    claimToken: string
  } | null> {
    const claimToken = crypto.randomUUID()
    const request = await claimInboundWebhookRequest({
      id,
      claimToken,
      leaseExpiredBefore: new Date(Date.now() - CLAIM_LEASE_MS),
    })
    return request ? { request, claimToken } : null
  }

  checkpointRequest(input: {
    id: string
    claimToken: string
    progress: InboundWebhookRequestProgress
  }): Promise<boolean> {
    return checkpointInboundWebhookRequest(input)
  }

  releaseRequest(input: { id: string; claimToken: string }): Promise<boolean> {
    return releaseInboundWebhookRequest(input)
  }

  completeRequest(input: {
    id: string
    claimToken: string
    completion: InboundWebhookRequestCompletion
  }): Promise<boolean> {
    return completeInboundWebhookRequest(input)
  }

  async listRequests(input: {
    workspaceId: string
    inboundWebhookId: string
    status?: InboundWebhookRequestStatus
    page: number
    perPage: number
  }): Promise<Paged<InboundWebhookRequestListRow>> {
    const { rows, total } = await listInboundWebhookRequestsPaginated({
      workspaceId: input.workspaceId,
      inboundWebhookId: input.inboundWebhookId,
      status: input.status
        ? inboundWebhookRequestStatuses.parse(input.status)
        : undefined,
      limit: input.perPage,
      offset: (input.page - 1) * input.perPage,
    })
    return { data: rows, pageCount: Math.ceil(total / input.perPage) }
  }

  async findRequestOrFail(input: {
    workspaceId: string
    inboundWebhookId: string
    id: string
  }): Promise<InboundWebhookRequestModel> {
    const request = await findInboundWebhookRequest(input)
    if (!request) {
      throw notFoundException("Inbound webhook request not found")
    }
    return request
  }

  /**
   * Requests nobody finished — never enqueued / job lost, or a worker that died
   * holding the claim — and still young enough to retry.
   */
  listStaleRequests(limit: number) {
    const now = Date.now()
    return listStaleInboundWebhookRequests({
      ...this.unfinishedWindow(now),
      createdAfter: new Date(now - REDISPATCH_MAX_AGE_MS),
      limit,
    })
  }

  /** Closes what re-dispatch has stopped retrying, so nothing stays pending forever. */
  abandonStaleRequests(): Promise<number> {
    const now = Date.now()
    return failAbandonedInboundWebhookRequests({
      ...this.unfinishedWindow(now),
      createdBefore: new Date(now - REDISPATCH_MAX_AGE_MS),
    })
  }

  private unfinishedWindow(now: number) {
    return {
      receivedBefore: new Date(now - UNCLAIMED_REQUEST_GRACE_MS),
      leaseExpiredBefore: new Date(now - CLAIM_LEASE_MS),
    }
  }

  purgeRequests(options: PurgeInboundWebhookRequestsOptions) {
    return purgeInboundWebhookRequests(options)
  }

  // ─── Validation ────────────────────────────────────────────────────────

  private async assertConfigValid(input: {
    workspaceId: string
    inboxResolution: InboundWebhookInboxResolution | null
    identifiers: InboundWebhookIdentifier[]
    fieldMappings: InboundWebhookFieldMapping[]
  }): Promise<void> {
    const [issue] = await validateInboundWebhookConfig(input)
    if (issue) {
      throw validationException(
        issue.field,
        `validation.inboundWebhook.${issue.code}`,
      )
    }
  }

  /** Mapped custom fields and the flows to start must exist in this workspace. */
  private async assertReferencesExist(input: {
    workspaceId: string
    fieldMappings: InboundWebhookFieldMapping[]
    actions: InboundWebhookAction[]
  }): Promise<void> {
    const { workspaceId, fieldMappings, actions } = input

    const customTargets = fieldMappings.filter(
      ({ target }) => classifyMappedTarget(target) === "customField",
    )
    const knownIds = new Set(customFieldTargetIds(fieldMappings))
    if (customTargets.some(({ target }) => !knownIds.has(target))) {
      throw validationException(
        "fieldMappings",
        "validation.inboundWebhook.unknownFieldTarget",
      )
    }
    if (knownIds.size > 0) {
      const found = await customFieldService.findManyByIds({
        workspaceId,
        ids: [...knownIds],
      })
      if (found.length !== knownIds.size) {
        throw validationException(
          "fieldMappings",
          "validation.inboundWebhook.unknownFieldTarget",
        )
      }
    }

    if (!(await actionReferencesExistInWorkspace({ workspaceId, actions }))) {
      throw validationException(
        "actions",
        "validation.inboundWebhook.actionReferenceNotFound",
      )
    }
  }

  private invalidate(ids: string[]) {
    return this.invalidateCacheTags(ids.map(webhookTag))
  }
}

export const inboundWebhookService = new InboundWebhookService()
