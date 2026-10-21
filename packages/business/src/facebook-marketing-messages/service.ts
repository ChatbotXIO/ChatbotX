import {
  type FacebookMarketingMessageBudgetType,
  type FacebookMarketingMessageStatus,
  type FacebookMarketingMessageTargetType,
  MM_START_DELAY_MS,
} from "@chatbotx.io/database/partials"
import {
  facebookMarketingMessageAudienceRepository,
  facebookMarketingMessageRepository,
  facebookMarketingMessagesAuthRepository,
  type MarketingMessageAdAccountSummary,
  type MarketingMessageStatisticsListInput,
} from "@chatbotx.io/database/repositories"
import type {
  FacebookMarketingMessageAudienceModel,
  FacebookMarketingMessageModel,
  FacebookMarketingMessagesAuthModel,
} from "@chatbotx.io/database/types"
import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import {
  type FacebookAdsAuthValue,
  facebookAdsAuthSchema,
} from "@chatbotx.io/integration-facebook-ads"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { mmDeliveryError } from "../facebook-marketing-message-delivery/errors"

export type CreateMarketingMessageInput = {
  workspaceId: string
  name: string
  pageId: string
  adAccountId: string
  currency: string
  currencyOffset: number
  budgetType: FacebookMarketingMessageBudgetType
  budgetMinorUnits: number
  content: unknown
  targetType: FacebookMarketingMessageTargetType
  /** Required for `customAudience`; ignored (stored as null) for `optIn`. */
  audienceId?: string | null
  campaignId: string
  facebookUserId?: string | null
}

/**
 * Content as the lock compares it: JSON-normalized, with the Meta attachment id
 * dropped. `attachmentId` is stamped on by the builder after an upload, so a
 * caller that omits it (the public API) must not look like a content change.
 */
function normalizeContentForLock(content: unknown): unknown {
  const plain = JSON.parse(JSON.stringify(content ?? null)) as unknown
  if (
    plain &&
    typeof plain === "object" &&
    "media" in plain &&
    plain.media &&
    typeof plain.media === "object"
  ) {
    const { attachmentId: _attachmentId, ...media } = plain.media as Record<
      string,
      unknown
    >
    return { ...plain, media }
  }
  return plain
}

/**
 * Structural equality over JSON values, key-order insensitive. Hand-rolled
 * instead of `node:util`'s `isDeepStrictEqual` because the business barrel must
 * stay Edge-Runtime safe (see `__tests__/edge-safe-import-graph.test.ts`).
 */
function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true
  }
  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object" ||
    Array.isArray(a) !== Array.isArray(b)
  ) {
    return false
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => jsonEqual(item, b[i]))
  }
  const aRecord = a as Record<string, unknown>
  const bRecord = b as Record<string, unknown>
  const aKeys = Object.keys(aRecord)
  return (
    aKeys.length === Object.keys(bRecord).length &&
    aKeys.every(
      (key) =>
        Object.hasOwn(bRecord, key) && jsonEqual(aRecord[key], bRecord[key]),
    )
  )
}

function contentChanged(stored: unknown, next: unknown): boolean {
  return !jsonEqual(
    normalizeContentForLock(stored),
    normalizeContentForLock(next),
  )
}

const CONTENT_EDITABLE_STATUSES: FacebookMarketingMessageStatus[] = [
  "notSent",
  "scheduled",
]

function isContentLocked(
  row: Pick<FacebookMarketingMessageModel, "firstSentAt" | "status">,
): boolean {
  return (
    row.firstSentAt !== null || !CONTENT_EDITABLE_STATUSES.includes(row.status)
  )
}

class FacebookMarketingMessagesService extends BaseService {
  findAuth(
    workspaceId: string,
  ): Promise<FacebookMarketingMessagesAuthModel | null> {
    return facebookMarketingMessagesAuthRepository.findByWorkspaceId(
      workspaceId,
    )
  }

  /**
   * Store or replace the workspace's grant. Re-granting replaces the token,
   * refreshes the expiry, overwrites the App-Scoped User ID, and clears any
   * `invalid` status left by a prior Graph 190.
   */
  async upsertAuth(input: {
    workspaceId: string
    auth: FacebookAdsAuthValue
    tokenExpiresAt: Date | null
    facebookUserId?: string | null
  }): Promise<void> {
    const encryptedAuth = await encryptUtils.encryptObject(input.auth)
    const existing = await this.findAuth(input.workspaceId)

    if (existing) {
      await facebookMarketingMessagesAuthRepository.updateAuth({
        id: existing.id,
        auth: encryptedAuth,
        tokenExpiresAt: input.tokenExpiresAt,
        facebookUserId: input.facebookUserId ?? null,
      })
      await this.audit("update", "reconnected Facebook Marketing Messages")
      return
    }

    await facebookMarketingMessagesAuthRepository.create({
      id: createId(),
      workspaceId: input.workspaceId,
      auth: encryptedAuth,
      tokenExpiresAt: input.tokenExpiresAt,
      facebookUserId: input.facebookUserId ?? null,
    })
    await this.audit("create", "connected Facebook Marketing Messages")
  }

  /**
   * Returns `null` rather than throwing on an undecryptable blob — a rotated
   * encryption key must surface as "re-grant needed" in the UI, not a 500.
   */
  async decryptAuth(
    row: FacebookMarketingMessagesAuthModel,
  ): Promise<FacebookAdsAuthValue | null> {
    try {
      // `decryptObject` validates against a schema rather than casting —
      // same call shape as `messaging-ads-connection/context.ts`.
      return await encryptUtils.decryptObject(
        encryptedDataSchema.parse(row.auth),
        facebookAdsAuthSchema,
      )
    } catch {
      return null
    }
  }

  /** Called whenever Graph answers 190 (expired/invalidated token). */
  markAuthInvalid(workspaceId: string): Promise<void> {
    return facebookMarketingMessagesAuthRepository.updateStatus({
      workspaceId,
      status: "invalid",
    })
  }

  list(workspaceId: string): Promise<FacebookMarketingMessageModel[]> {
    return facebookMarketingMessageRepository.listByWorkspaceId(workspaceId)
  }

  listForStatistics(input: MarketingMessageStatisticsListInput) {
    return facebookMarketingMessageRepository.listForStatistics(input)
  }

  listAdAccountsByWorkspaceId(
    workspaceId: string,
  ): Promise<MarketingMessageAdAccountSummary[]> {
    return facebookMarketingMessageRepository.listAdAccountsByWorkspaceId(
      workspaceId,
    )
  }

  find(input: {
    id: string
    workspaceId: string
  }): Promise<FacebookMarketingMessageModel | null> {
    return facebookMarketingMessageRepository.findForWorkspace(input)
  }

  /**
   * The audience a `customAudience` campaign may target: same workspace, same
   * ad account and Page, and ready (subscription tokens exist). `null` when
   * any of those fails — the client filter is a convenience, not a boundary.
   */
  async findTargetableAudience(input: {
    workspaceId: string
    audienceId: string
    adAccountId: string
    pageId: string
  }): Promise<FacebookMarketingMessageAudienceModel | null> {
    const audience =
      await facebookMarketingMessageAudienceRepository.findForWorkspace({
        id: input.audienceId,
        workspaceId: input.workspaceId,
      })
    if (
      !audience ||
      audience.adAccountId !== input.adAccountId ||
      audience.pageId !== input.pageId ||
      audience.readyAt === null
    ) {
      return null
    }
    return audience
  }

  async create(
    input: CreateMarketingMessageInput,
  ): Promise<FacebookMarketingMessageModel> {
    const row = await facebookMarketingMessageRepository.create({
      ...input,
      status: "scheduled",
      startsAt: new Date(Date.now() + MM_START_DELAY_MS),
      audienceId:
        input.targetType === "customAudience"
          ? (input.audienceId ?? null)
          : null,
      id: createId(),
      facebookUserId: input.facebookUserId ?? null,
    })
    await this.audit("create", `created the marketing message "${input.name}"`)
    return row
  }

  /**
   * Content is locked once the first message has gone out (spec D10): every
   * recipient must see the same message. It is also locked once the campaign
   * has left `notSent`/`scheduled`, since a send may be about to start. Name
   * and budget stay editable. Throws `mmContentLocked` when `content` differs
   * from the stored row.
   */
  assertContentEditable(input: {
    row: Pick<
      FacebookMarketingMessageModel,
      "firstSentAt" | "status" | "content"
    >
    content: unknown
  }): void {
    if (
      isContentLocked(input.row) &&
      contentChanged(input.row.content, input.content)
    ) {
      throw mmDeliveryError("mmContentLocked")
    }
  }

  /**
   * A content change is written conditionally (nothing sent yet, campaign
   * not started), so it cannot race the first send; losing that race throws
   * `mmContentLocked`. Name/budget-only edits are unconditional and leave the
   * stored content untouched.
   */
  async update(input: {
    id: string
    workspaceId: string
    name: string
    budgetType: FacebookMarketingMessageBudgetType
    budgetMinorUnits: number
    content: unknown
  }): Promise<FacebookMarketingMessageModel | null> {
    const existing = await facebookMarketingMessageRepository.findForWorkspace({
      id: input.id,
      workspaceId: input.workspaceId,
    })
    if (!existing) {
      return null
    }
    const changesContent = contentChanged(existing.content, input.content)
    const row = await facebookMarketingMessageRepository.update({
      id: input.id,
      workspaceId: input.workspaceId,
      name: input.name,
      budgetType: input.budgetType,
      budgetMinorUnits: input.budgetMinorUnits,
      ...(changesContent ? { content: input.content, lockContent: true } : {}),
    })
    if (!row && changesContent) {
      throw mmDeliveryError("mmContentLocked")
    }
    await this.audit("update", `updated the marketing message "${input.name}"`)
    return row
  }

  async remove(input: { ids: string[]; workspaceId: string }): Promise<void> {
    await facebookMarketingMessageRepository.remove(input)
    await this.audit(
      "delete",
      `deleted ${input.ids.length} marketing message(s)`,
    )
  }
}

export const facebookMarketingMessagesService =
  new FacebookMarketingMessagesService()
