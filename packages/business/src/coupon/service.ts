import { db, eq, isUniqueViolationError } from "@chatbotx.io/database/client"
import {
  couponTopicStatuses,
  fileStatuses,
} from "@chatbotx.io/database/partials"
import { couponRepository } from "@chatbotx.io/database/repositories"
import { workspaceModel } from "@chatbotx.io/database/schema"
import { formatInTimeZone, fromZonedTime } from "date-fns-tz"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"

export type CouponImportBatchResult = {
  processed: number
  created: number
  existing: number
  allowedRemaining: number
  currentCount: number
}

export type CouponIssueResult =
  | {
      ok: true
      reason: "issued" | "existing"
      coupon: NonNullable<
        Awaited<ReturnType<typeof couponRepository.findIssuedCoupon>>
      >
    }
  | {
      ok: false
      reason: "topicUnavailable" | "noAvailableCoupon"
      coupon: null
    }

export type CouponMarkUsedResult =
  | {
      ok: true
      reason: "markedUsed" | "alreadyUsed"
      coupon: NonNullable<
        Awaited<ReturnType<typeof couponRepository.findIssuedCoupon>>
      >
    }
  | { ok: false; reason: "noIssuedCoupon"; coupon: null }

const MAX_COUPONS_PER_TOPIC = 10_000
const NAME_MAX_LENGTH = 255
const DESCRIPTION_MAX_LENGTH = 1000

const trimNullable = (value: string | null | undefined) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

const normalizeName = (name: string) => name.trim()

const endOfSelectedDayInTimezone = (
  date: Date | null | undefined,
  timezone: string,
) => {
  if (!date) {
    return null
  }

  try {
    const day = formatInTimeZone(date, timezone, "yyyy-MM-dd")
    return fromZonedTime(`${day}T23:59:59.999`, timezone)
  } catch {
    throw new ChatbotXException("Invalid validity date", "invalidValidityDate")
  }
}

const throwIfInvalidTopicInput = (input: {
  name?: string
  description?: string | null
}) => {
  if (input.name !== undefined) {
    const name = normalizeName(input.name)
    if (!name) {
      throw new ChatbotXException(
        "Coupon topic name is required",
        "couponTopicNameRequired",
      )
    }
    if (name.length > NAME_MAX_LENGTH) {
      throw new ChatbotXException(
        "Coupon topic name is too long",
        "couponTopicNameTooLong",
      )
    }
  }

  const description = trimNullable(input.description)
  if (description && description.length > DESCRIPTION_MAX_LENGTH) {
    throw new ChatbotXException(
      "Coupon topic description is too long",
      "couponTopicDescriptionTooLong",
    )
  }
}

class CouponService extends BaseService {
  async listTopics(input: Parameters<typeof couponRepository.listTopics>[0]) {
    return await couponRepository.listTopics(input)
  }

  async listCoupons(input: Parameters<typeof couponRepository.listCoupons>[0]) {
    return await couponRepository.listCoupons(input)
  }

  async countCoupons(
    input: Parameters<typeof couponRepository.countCoupons>[0],
  ) {
    return await couponRepository.countCoupons(input)
  }

  async listCouponsForExport(
    input: Parameters<typeof couponRepository.listCoupons>[0],
  ) {
    const limit = input.perPage ?? 1000
    const rows: Awaited<
      ReturnType<typeof couponRepository.listCouponsForExportPage>
    > = []
    let lastId: string | null = null

    while (true) {
      const page = await couponRepository.listCouponsForExportPage({
        workspaceId: input.workspaceId,
        filter: {
          topicId: input.topicId,
          issueStatus: input.issueStatus,
          usageStatus: input.usageStatus,
          search: input.search,
        },
        lastId,
        limit,
      })
      rows.push(...page)
      if (page.length < limit) {
        break
      }
      lastId = page.at(-1)?.id ?? null
      if (!lastId) {
        break
      }
    }

    return rows
  }

  async listCouponsForExportPage(input: {
    workspaceId: string
    filter: Parameters<
      typeof couponRepository.listCouponsForExportPage
    >[0]["filter"]
    lastId?: string | null
    limit?: number
  }) {
    return await couponRepository.listCouponsForExportPage(input)
  }

  async listActiveTopicOptions(input: {
    workspaceId: string
    keyword?: string
    issueableOnly?: boolean
  }) {
    return await couponRepository.listActiveTopicOptions(input)
  }

  async getTopic(input: {
    workspaceId: string
    topicId: string
    includeDeleted?: boolean
  }) {
    const topic = await couponRepository.findTopic(input)
    if (!topic) {
      throw notFoundException("Coupon topic not found")
    }
    return topic
  }

  async createTopic(input: {
    workspaceId: string
    createdById?: string | null
    name: string
    description?: string | null
    expiresAt?: Date | null
  }) {
    throwIfInvalidTopicInput(input)
    const name = normalizeName(input.name)
    const description = trimNullable(input.description)
    await this.throwIfDuplicateName({
      workspaceId: input.workspaceId,
      name,
    })
    const expiresAt = await this.normalizeExpiresAt({
      workspaceId: input.workspaceId,
      expiresAt: input.expiresAt,
      rejectPast: true,
    })

    const topic = await couponRepository.createTopic({
      workspaceId: input.workspaceId,
      createdById: input.createdById,
      name,
      description,
      expiresAt,
    })
    await this.invalidateCacheTags(this.cacheTag(input.workspaceId))
    return topic
  }

  async updateTopic(input: {
    workspaceId: string
    topicId: string
    name?: string
    description?: string | null
    expiresAt?: Date | null
  }) {
    throwIfInvalidTopicInput(input)
    const existing = await this.getTopic(input)
    const locked = existing.hasEverHadCoupon
    let name: string | undefined
    let description: string | null | undefined

    if (!locked) {
      name = input.name === undefined ? undefined : normalizeName(input.name)
      description =
        input.description === undefined
          ? undefined
          : trimNullable(input.description)
    }

    if (name) {
      await this.throwIfDuplicateName({
        workspaceId: input.workspaceId,
        name,
        excludeId: input.topicId,
      })
    }

    const expiresAt =
      input.expiresAt === undefined
        ? undefined
        : await this.normalizeExpiresAt({
            workspaceId: input.workspaceId,
            expiresAt: input.expiresAt,
            rejectPast: false,
          })

    const topic = await couponRepository.updateTopic({
      workspaceId: input.workspaceId,
      topicId: input.topicId,
      name,
      description,
      expiresAt,
    })
    if (!topic) {
      throw notFoundException("Coupon topic not found")
    }
    await this.invalidateCacheTags(this.cacheTag(input.workspaceId))
    return topic
  }

  async archiveTopic(input: { workspaceId: string; topicId: string }) {
    const topic = await couponRepository.setTopicStatus({
      ...input,
      status: couponTopicStatuses.enum.archived,
    })
    if (!topic) {
      throw notFoundException("Coupon topic not found")
    }
    await this.invalidateCacheTags(this.cacheTag(input.workspaceId))
    return topic
  }

  async unarchiveTopic(input: { workspaceId: string; topicId: string }) {
    const topic = await couponRepository.setTopicStatus({
      ...input,
      status: couponTopicStatuses.enum.active,
    })
    if (!topic) {
      throw notFoundException("Coupon topic not found")
    }
    await this.invalidateCacheTags(this.cacheTag(input.workspaceId))
    return topic
  }

  async deleteTopic(input: { workspaceId: string; topicId: string }) {
    const topic = await couponRepository.softDeleteTopic(input)
    if (!topic) {
      throw notFoundException("Archived coupon topic not found")
    }
    await this.invalidateCacheTags(this.cacheTag(input.workspaceId))
    return topic
  }

  async importBatch(input: {
    workspaceId: string
    topicId: string
    codes: string[]
  }): Promise<CouponImportBatchResult> {
    const codes = Array.from(
      new Set(input.codes.map((code) => code.trim()).filter(Boolean)),
    )

    return await db.transaction(async (tx) => {
      const topic = await couponRepository.lockTopic(input, tx)
      if (!topic || topic.status !== couponTopicStatuses.enum.active) {
        throw new ChatbotXException(
          "Coupon topic is not active",
          "couponTopicInactive",
        )
      }

      const currentCount = await couponRepository.countTopicCoupons(input, tx)
      const allowedRemaining = Math.max(0, MAX_COUPONS_PER_TOPIC - currentCount)

      const existingCodes = await couponRepository.findExistingCodes(
        { workspaceId: input.workspaceId, codes },
        tx,
      )
      const newCodes = codes.filter((code) => !existingCodes.has(code))

      if (newCodes.length > allowedRemaining) {
        throw new ChatbotXException(
          "Coupon import exceeds topic limit",
          "couponImportLimitExceeded",
        )
      }

      const inserted = await couponRepository.insertCoupons(
        { ...input, codes: newCodes },
        tx,
      )
      if (inserted.length > 0) {
        await couponRepository.markTopicHasCoupons(input, tx)
      }

      return {
        processed: codes.length,
        created: inserted.length,
        existing:
          codes.length - newCodes.length + (newCodes.length - inserted.length),
        allowedRemaining,
        currentCount,
      }
    })
  }

  async issueCoupon(input: {
    workspaceId: string
    topicId: string
    contactId: string
  }): Promise<CouponIssueResult> {
    const topic = await couponRepository.isTopicIssueable(input)
    if (!topic) {
      return { ok: false, reason: "topicUnavailable", coupon: null }
    }

    try {
      const coupon = await db.transaction(async (tx) => {
        const existing = await couponRepository.findIssuedCoupon(input, tx)
        if (existing) {
          return { reason: "existing" as const, coupon: existing }
        }

        const claimed = await couponRepository.claimCoupon(input, tx)
        if (!claimed) {
          return { reason: "noAvailableCoupon" as const, coupon: null }
        }
        return { reason: "issued" as const, coupon: claimed }
      })

      if (!coupon.coupon) {
        return { ok: false, reason: coupon.reason, coupon: null }
      }
      return { ok: true, reason: coupon.reason, coupon: coupon.coupon }
    } catch (error) {
      if (isUniqueViolationError(error)) {
        const winner = await couponRepository.findIssuedCoupon(input)
        if (winner) {
          return { ok: true, reason: "existing", coupon: winner }
        }
      }
      throw error
    }
  }

  async markCouponUsed(input: {
    workspaceId: string
    topicId: string
    contactId: string
  }): Promise<CouponMarkUsedResult> {
    const existing = await couponRepository.findIssuedCoupon(input)
    if (!existing) {
      return { ok: false, reason: "noIssuedCoupon", coupon: null }
    }
    if (existing.usedAt) {
      return { ok: true, reason: "alreadyUsed", coupon: existing }
    }

    const marked = await couponRepository.markUsed(input)
    if (marked) {
      return { ok: true, reason: "markedUsed", coupon: marked }
    }

    const current = await couponRepository.findIssuedCoupon(input)
    return { ok: true, reason: "alreadyUsed", coupon: current ?? existing }
  }

  async resolveCouponVariable(input: {
    workspaceId: string
    topicId: string
    contactId: string
  }) {
    return await couponRepository.findIssuedCouponCode(input)
  }

  async listIssuedCouponsForContact(input: {
    workspaceId: string
    contactId: string
  }) {
    return await couponRepository.listIssuedCouponsForContact(input)
  }

  async createImport(
    input: Parameters<typeof couponRepository.createImport>[0],
  ) {
    return await couponRepository.createImport(input)
  }

  async startImport(input: {
    workspaceId: string
    userId: string | null
    fileId: string
    topicId: string
  }) {
    const [file, topic] = await Promise.all([
      couponRepository.getImportFile(input),
      couponRepository.findTopic(input),
    ])
    if (!file) {
      throw new ChatbotXException(
        "Coupon import file not found",
        "couponImportFileNotFound",
      )
    }
    if (
      !file.fileName.toLowerCase().endsWith(".csv") ||
      file.mimeType !== "text/csv"
    ) {
      throw new ChatbotXException(
        "Unsupported coupon import file",
        "couponImportUnsupportedFile",
      )
    }
    if (!topic || topic.status !== couponTopicStatuses.enum.active) {
      throw new ChatbotXException(
        "Coupon topic is not active",
        "couponTopicInactive",
      )
    }

    return await db.transaction(async (tx) => {
      await couponRepository.markImportFileUploaded(
        { workspaceId: input.workspaceId, fileId: input.fileId },
        tx,
      )
      return await couponRepository.createImport(
        {
          workspaceId: input.workspaceId,
          userId: input.userId,
          fileId: input.fileId,
          topicId: input.topicId,
          format: "csv",
        },
        tx,
      )
    })
  }

  async createExportFile(
    input: Parameters<typeof couponRepository.createExportFile>[0],
  ) {
    return await couponRepository.createExportFile(input)
  }

  async getExportFile(
    input: Parameters<typeof couponRepository.getExportFile>[0],
  ) {
    const file = await couponRepository.getExportFile(input)
    if (!file) {
      throw notFoundException("Export file not found")
    }
    return {
      id: file.id,
      status: fileStatuses.parse(file.status),
      fileName: file.fileName,
      path: file.path,
      totalRecords: file.meta?.totalRecords ?? 0,
      fileSize: file.fileSize,
    }
  }

  private async throwIfDuplicateName(input: {
    workspaceId: string
    name: string
    excludeId?: string
  }) {
    const existing = await couponRepository.findTopicByName(input)
    if (existing) {
      throw new ChatbotXException(
        "Coupon topic name already exists",
        "couponTopicNameDuplicated",
      )
    }
  }

  private async normalizeExpiresAt(input: {
    workspaceId: string
    expiresAt?: Date | null
    rejectPast: boolean
  }) {
    const [workspace] = await db
      .select({ timezone: workspaceModel.timezone })
      .from(workspaceModel)
      .where(eq(workspaceModel.id, input.workspaceId))
      .limit(1)
    if (!workspace) {
      throw notFoundException("Workspace not found")
    }

    const expiresAt = endOfSelectedDayInTimezone(
      input.expiresAt,
      workspace.timezone,
    )
    if (input.rejectPast && expiresAt && expiresAt <= new Date()) {
      throw new ChatbotXException(
        "Coupon topic validity cannot be in the past",
        "couponTopicValidityInPast",
      )
    }
    return expiresAt
  }

  private cacheTag(workspaceId: string) {
    return `coupons:${workspaceId}`
  }
}

export const couponService = new CouponService()
