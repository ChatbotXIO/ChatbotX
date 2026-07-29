import {
  and,
  asc,
  count,
  type DatabaseClient,
  db,
  eq,
  gt,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
} from "@chatbotx.io/database/client"
import {
  type CouponImportMeta,
  type CouponIssueStatus,
  type CouponUsageStatus,
  couponIssueStatuses,
  couponTopicStatuses,
  couponUsageStatuses,
  exportSubTypes,
  fileContextTypes,
  fileStatuses,
  importFormats,
  importStatuses,
  importTypes,
} from "@chatbotx.io/database/partials"
import {
  couponModel,
  couponTopicModel,
  fileModel,
  importModel,
} from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  likeContains,
} from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"

export type CouponTopicListInput = {
  workspaceId: string
  archived?: boolean
  search?: string
  page?: number
  perPage?: number
  sort?: { id: string; desc: boolean }[]
}

export type CouponListInput = {
  workspaceId: string
  topicId?: string
  issueStatus?: CouponIssueStatus
  usageStatus?: CouponUsageStatus
  search?: string
  page?: number
  perPage?: number
}

export type CouponTopicRow = typeof couponTopicModel.$inferSelect & {
  couponCount: number
}

export type CouponListRow = typeof couponModel.$inferSelect & {
  topicName: string
  issueStatus: CouponIssueStatus
  usageStatus: CouponUsageStatus
}

const topicManagementWhere = (input: {
  workspaceId: string
  archived?: boolean
  search?: string
}) =>
  and(
    eq(couponTopicModel.workspaceId, input.workspaceId),
    isNull(couponTopicModel.deletedAt),
    eq(
      couponTopicModel.status,
      input.archived
        ? couponTopicStatuses.enum.archived
        : couponTopicStatuses.enum.active,
    ),
    input.search
      ? ilike(couponTopicModel.name, likeContains(input.search))
      : undefined,
  )

const activeTopicWhere = (workspaceId: string) =>
  and(
    eq(couponTopicModel.workspaceId, workspaceId),
    eq(couponTopicModel.status, couponTopicStatuses.enum.active),
    isNull(couponTopicModel.deletedAt),
  )

const couponListWhere = (input: CouponListInput) =>
  and(
    eq(couponModel.workspaceId, input.workspaceId),
    activeTopicWhere(input.workspaceId),
    input.topicId ? eq(couponModel.topicId, input.topicId) : undefined,
    input.search
      ? ilike(couponModel.code, likeContains(input.search))
      : undefined,
    input.issueStatus === couponIssueStatuses.enum.published
      ? isNotNull(couponModel.issuedContactId)
      : undefined,
    input.issueStatus === couponIssueStatuses.enum.unpublished
      ? isNull(couponModel.issuedContactId)
      : undefined,
    input.usageStatus === couponUsageStatuses.enum.used
      ? isNotNull(couponModel.usedAt)
      : undefined,
    input.usageStatus === couponUsageStatuses.enum.notUsed
      ? isNull(couponModel.usedAt)
      : undefined,
  )

const toCouponListRow = (
  row: typeof couponModel.$inferSelect & { topicName: string },
): CouponListRow => ({
  ...row,
  issueStatus: row.issuedContactId
    ? couponIssueStatuses.enum.published
    : couponIssueStatuses.enum.unpublished,
  usageStatus: row.usedAt
    ? couponUsageStatuses.enum.used
    : couponUsageStatuses.enum.notUsed,
})

export const couponRepository = {
  async listTopics(
    input: CouponTopicListInput,
    tx: DatabaseClient = db,
  ): Promise<{ data: CouponTopicRow[]; pageCount: number; total: number }> {
    const pagination = getPaginationWithDefaults(input)
    const where = topicManagementWhere(input)
    const order =
      input.sort?.find((item) => item.id === "name")?.desc === true
        ? sql`${couponTopicModel.name} desc`
        : asc(couponTopicModel.name)

    const [rows, total] = await Promise.all([
      tx
        .select({
          id: couponTopicModel.id,
          createdAt: couponTopicModel.createdAt,
          updatedAt: couponTopicModel.updatedAt,
          workspaceId: couponTopicModel.workspaceId,
          name: couponTopicModel.name,
          description: couponTopicModel.description,
          expiresAt: couponTopicModel.expiresAt,
          status: couponTopicModel.status,
          deletedAt: couponTopicModel.deletedAt,
          hasEverHadCoupon: couponTopicModel.hasEverHadCoupon,
          createdById: couponTopicModel.createdById,
          couponCount: count(couponModel.id),
        })
        .from(couponTopicModel)
        .leftJoin(
          couponModel,
          and(
            eq(couponModel.topicId, couponTopicModel.id),
            eq(couponModel.workspaceId, couponTopicModel.workspaceId),
          ),
        )
        .where(where)
        .groupBy(couponTopicModel.id)
        .orderBy(order)
        .limit(pagination.limit)
        .offset(pagination.offset),
      tx.$count(couponTopicModel, where),
    ])

    return {
      data: rows.map((row) => ({
        ...row,
        status: couponTopicStatuses.parse(row.status),
        couponCount: Number(row.couponCount),
      })),
      total,
      pageCount: Math.ceil(total / pagination.limit),
    }
  },

  async findTopic(
    input: { workspaceId: string; topicId: string; includeDeleted?: boolean },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.couponTopicModel.findFirst({
      where: {
        id: input.topicId,
        workspaceId: input.workspaceId,
        deletedAt: input.includeDeleted ? undefined : { isNull: true },
      },
    })
  },

  async findTopicByName(
    input: { workspaceId: string; name: string; excludeId?: string },
    tx: DatabaseClient = db,
  ) {
    const rows = await tx
      .select()
      .from(couponTopicModel)
      .where(
        and(
          eq(couponTopicModel.workspaceId, input.workspaceId),
          isNull(couponTopicModel.deletedAt),
          eq(sql`lower(${couponTopicModel.name})`, input.name.toLowerCase()),
          input.excludeId
            ? ne(couponTopicModel.id, input.excludeId)
            : undefined,
        ),
      )
      .limit(1)

    return rows[0]
  },

  async createTopic(
    input: {
      workspaceId: string
      name: string
      description?: string | null
      expiresAt?: Date | null
      createdById?: string | null
    },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .insert(couponTopicModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        name: input.name,
        description: input.description ?? null,
        expiresAt: input.expiresAt ?? null,
        status: couponTopicStatuses.enum.active,
        createdById: input.createdById ?? null,
      })
      .returning()
    return row
  },

  async updateTopic(
    input: {
      workspaceId: string
      topicId: string
      name?: string
      description?: string | null
      expiresAt?: Date | null
    },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .update(couponTopicModel)
      .set({
        name: input.name,
        description: input.description,
        expiresAt: input.expiresAt,
      })
      .where(
        and(
          eq(couponTopicModel.id, input.topicId),
          eq(couponTopicModel.workspaceId, input.workspaceId),
          isNull(couponTopicModel.deletedAt),
        ),
      )
      .returning()
    return row
  },

  async setTopicStatus(
    input: {
      workspaceId: string
      topicId: string
      status: (typeof couponTopicStatuses.enum)[keyof typeof couponTopicStatuses.enum]
    },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .update(couponTopicModel)
      .set({ status: input.status })
      .where(
        and(
          eq(couponTopicModel.id, input.topicId),
          eq(couponTopicModel.workspaceId, input.workspaceId),
          isNull(couponTopicModel.deletedAt),
        ),
      )
      .returning()
    return row
  },

  async softDeleteTopic(
    input: { workspaceId: string; topicId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .update(couponTopicModel)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(couponTopicModel.id, input.topicId),
          eq(couponTopicModel.workspaceId, input.workspaceId),
          eq(couponTopicModel.status, couponTopicStatuses.enum.archived),
          isNull(couponTopicModel.deletedAt),
        ),
      )
      .returning()
    return row
  },

  async listActiveTopicOptions(
    input: { workspaceId: string; keyword?: string; issueableOnly?: boolean },
    tx: DatabaseClient = db,
  ) {
    const now = new Date()
    return await tx
      .select({
        id: couponTopicModel.id,
        name: couponTopicModel.name,
        expiresAt: couponTopicModel.expiresAt,
      })
      .from(couponTopicModel)
      .where(
        and(
          activeTopicWhere(input.workspaceId),
          input.keyword
            ? ilike(couponTopicModel.name, likeContains(input.keyword))
            : undefined,
          input.issueableOnly
            ? or(
                isNull(couponTopicModel.expiresAt),
                gt(couponTopicModel.expiresAt, now),
              )
            : undefined,
        ),
      )
      .orderBy(asc(couponTopicModel.name))
  },

  async listCoupons(
    input: CouponListInput,
    tx: DatabaseClient = db,
  ): Promise<{ data: CouponListRow[]; pageCount: number; total: number }> {
    const pagination = getPaginationWithDefaults(input)
    const where = couponListWhere(input)
    const [rows, total] = await Promise.all([
      tx
        .select({
          id: couponModel.id,
          createdAt: couponModel.createdAt,
          updatedAt: couponModel.updatedAt,
          workspaceId: couponModel.workspaceId,
          topicId: couponModel.topicId,
          code: couponModel.code,
          issuedContactId: couponModel.issuedContactId,
          issuedAt: couponModel.issuedAt,
          usedAt: couponModel.usedAt,
          topicName: couponTopicModel.name,
        })
        .from(couponModel)
        .innerJoin(
          couponTopicModel,
          and(
            eq(couponTopicModel.id, couponModel.topicId),
            activeTopicWhere(input.workspaceId),
          ),
        )
        .where(where)
        .orderBy(asc(couponModel.createdAt))
        .limit(pagination.limit)
        .offset(pagination.offset),
      tx
        .select({ total: count(couponModel.id) })
        .from(couponModel)
        .innerJoin(
          couponTopicModel,
          and(
            eq(couponTopicModel.id, couponModel.topicId),
            activeTopicWhere(input.workspaceId),
          ),
        )
        .where(where)
        .then((result) => Number(result[0]?.total ?? 0)),
    ])

    return {
      data: rows.map(toCouponListRow),
      total,
      pageCount: Math.ceil(total / pagination.limit),
    }
  },

  async countCoupons(input: CouponListInput, tx: DatabaseClient = db) {
    const where = couponListWhere(input)
    const [row] = await tx
      .select({ total: count(couponModel.id) })
      .from(couponModel)
      .innerJoin(
        couponTopicModel,
        and(
          eq(couponTopicModel.id, couponModel.topicId),
          activeTopicWhere(input.workspaceId),
        ),
      )
      .where(where)
    return Number(row?.total ?? 0)
  },

  async listCouponsForExportPage(
    input: {
      workspaceId: string
      filter: Omit<CouponListInput, "workspaceId" | "page" | "perPage">
      lastId?: string | null
      limit?: number
    },
    tx: DatabaseClient = db,
  ) {
    const rows = await tx
      .select({
        id: couponModel.id,
        createdAt: couponModel.createdAt,
        updatedAt: couponModel.updatedAt,
        workspaceId: couponModel.workspaceId,
        topicId: couponModel.topicId,
        code: couponModel.code,
        issuedContactId: couponModel.issuedContactId,
        issuedAt: couponModel.issuedAt,
        usedAt: couponModel.usedAt,
        topicName: couponTopicModel.name,
      })
      .from(couponModel)
      .innerJoin(
        couponTopicModel,
        and(
          eq(couponTopicModel.id, couponModel.topicId),
          activeTopicWhere(input.workspaceId),
        ),
      )
      .where(
        and(
          couponListWhere({ workspaceId: input.workspaceId, ...input.filter }),
          input.lastId ? gt(couponModel.id, input.lastId) : undefined,
        ),
      )
      .orderBy(asc(couponModel.id))
      .limit(input.limit ?? 1000)

    return rows.map(toCouponListRow)
  },

  async countTopicCoupons(
    input: { workspaceId: string; topicId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.$count(
      couponModel,
      and(
        eq(couponModel.workspaceId, input.workspaceId),
        eq(couponModel.topicId, input.topicId),
      ),
    )
  },

  async findExistingCodes(
    input: { workspaceId: string; codes: string[] },
    tx: DatabaseClient = db,
  ) {
    if (input.codes.length === 0) {
      return new Set<string>()
    }
    const rows = await tx
      .select({ code: couponModel.code })
      .from(couponModel)
      .where(
        and(
          eq(couponModel.workspaceId, input.workspaceId),
          inArray(couponModel.code, input.codes),
        ),
      )
    return new Set(rows.map((row) => row.code))
  },

  async insertCoupons(
    input: { workspaceId: string; topicId: string; codes: string[] },
    tx: DatabaseClient = db,
  ) {
    if (input.codes.length === 0) {
      return []
    }
    return await tx
      .insert(couponModel)
      .values(
        input.codes.map((code) => ({
          id: createId(),
          workspaceId: input.workspaceId,
          topicId: input.topicId,
          code,
        })),
      )
      .onConflictDoNothing()
      .returning()
  },

  async lockTopic(
    input: { workspaceId: string; topicId: string },
    tx: DatabaseClient,
  ) {
    const [row] = await tx
      .select()
      .from(couponTopicModel)
      .where(
        and(
          eq(couponTopicModel.id, input.topicId),
          eq(couponTopicModel.workspaceId, input.workspaceId),
          isNull(couponTopicModel.deletedAt),
        ),
      )
      .limit(1)
      .for("update")
    return row
  },

  async markTopicHasCoupons(
    input: { workspaceId: string; topicId: string },
    tx: DatabaseClient = db,
  ) {
    await tx
      .update(couponTopicModel)
      .set({ hasEverHadCoupon: true })
      .where(
        and(
          eq(couponTopicModel.id, input.topicId),
          eq(couponTopicModel.workspaceId, input.workspaceId),
        ),
      )
  },

  async findIssuedCoupon(
    input: { workspaceId: string; topicId: string; contactId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.couponModel.findFirst({
      where: {
        workspaceId: input.workspaceId,
        topicId: input.topicId,
        issuedContactId: input.contactId,
      },
    })
  },

  async claimCoupon(
    input: { workspaceId: string; topicId: string; contactId: string },
    tx: DatabaseClient,
  ) {
    const candidateId = tx
      .select({ id: couponModel.id })
      .from(couponModel)
      .where(
        and(
          eq(couponModel.workspaceId, input.workspaceId),
          eq(couponModel.topicId, input.topicId),
          isNull(couponModel.issuedContactId),
        ),
      )
      .orderBy(couponModel.id)
      .limit(1)
      .for("update", { skipLocked: true })

    const [claimed] = await tx
      .update(couponModel)
      .set({ issuedContactId: input.contactId, issuedAt: new Date() })
      .where(inArray(couponModel.id, candidateId))
      .returning()
    return claimed
  },

  async markUsed(
    input: { workspaceId: string; topicId: string; contactId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .update(couponModel)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(couponModel.workspaceId, input.workspaceId),
          eq(couponModel.topicId, input.topicId),
          eq(couponModel.issuedContactId, input.contactId),
          isNull(couponModel.usedAt),
        ),
      )
      .returning()
    return row
  },

  async findIssuedCouponCode(
    input: { workspaceId: string; topicId: string; contactId: string },
    tx: DatabaseClient = db,
  ) {
    const row = await this.findIssuedCoupon(input, tx)
    return row?.code ?? ""
  },

  async listIssuedCouponsForContact(
    input: { workspaceId: string; contactId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx
      .select({
        id: couponModel.id,
        topicId: couponModel.topicId,
        topicName: couponTopicModel.name,
        code: couponModel.code,
        usedAt: couponModel.usedAt,
        issuedAt: couponModel.issuedAt,
      })
      .from(couponModel)
      .innerJoin(
        couponTopicModel,
        and(
          eq(couponTopicModel.id, couponModel.topicId),
          eq(couponTopicModel.workspaceId, input.workspaceId),
          isNull(couponTopicModel.deletedAt),
        ),
      )
      .where(
        and(
          eq(couponModel.workspaceId, input.workspaceId),
          eq(couponModel.issuedContactId, input.contactId),
        ),
      )
      .orderBy(asc(couponTopicModel.name))
  },

  async createImport(
    input: {
      workspaceId: string
      userId: string | null
      fileId: string
      topicId: string
      format?: "csv"
    },
    tx: DatabaseClient = db,
  ) {
    const meta: CouponImportMeta = { topicId: input.topicId }
    const [row] = await tx
      .insert(importModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        inboxId: null,
        userId: input.userId,
        fileId: input.fileId,
        type: importTypes.enum.coupons,
        format: input.format ?? importFormats.enum.csv,
        status: importStatuses.enum.pending,
        meta,
      })
      .returning()
    return row
  },

  async getImportFile(
    input: { workspaceId: string; fileId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.fileModel.findFirst({
      where: {
        id: input.fileId,
        workspaceId: input.workspaceId,
        contextType: fileContextTypes.enum.import,
        subType: importTypes.enum.coupons,
      },
    })
  },

  async markImportFileUploaded(
    input: { workspaceId: string; fileId: string },
    tx: DatabaseClient = db,
  ) {
    await tx
      .update(fileModel)
      .set({
        status: fileStatuses.enum.uploaded,
        uploadedAt: new Date(),
      })
      .where(
        and(
          eq(fileModel.id, input.fileId),
          eq(fileModel.workspaceId, input.workspaceId),
        ),
      )
  },

  async createExportFile(
    input: {
      workspaceId: string
      userId: string | null
      fileName: string
      path: string
    },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .insert(fileModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        userId: input.userId,
        contextType: fileContextTypes.enum.export,
        subType: exportSubTypes.enum.coupons,
        path: input.path,
        fileName: input.fileName,
        mimeType: "text/csv",
        status: fileStatuses.enum.pending,
      })
      .returning()
    return row
  },

  async getExportFile(
    input: { workspaceId: string; fileId: string; userId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.fileModel.findFirst({
      where: {
        id: input.fileId,
        workspaceId: input.workspaceId,
        userId: input.userId,
        contextType: fileContextTypes.enum.export,
        subType: exportSubTypes.enum.coupons,
      },
    })
  },

  async updateExportFile(
    input: {
      fileId: string
      workspaceId: string
      status?: (typeof fileStatuses.enum)[keyof typeof fileStatuses.enum]
      fileSize?: string | null
      meta?: { totalRecords?: number }
      uploadedAt?: Date | null
    },
    tx: DatabaseClient = db,
  ) {
    await tx
      .update(fileModel)
      .set({
        status: input.status,
        fileSize: input.fileSize,
        meta: input.meta,
        uploadedAt: input.uploadedAt,
      })
      .where(
        and(
          eq(fileModel.id, input.fileId),
          eq(fileModel.workspaceId, input.workspaceId),
        ),
      )
  },

  async isTopicIssueable(
    input: { workspaceId: string; topicId: string },
    tx: DatabaseClient = db,
  ) {
    const now = new Date()
    const [row] = await tx
      .select()
      .from(couponTopicModel)
      .where(
        and(
          eq(couponTopicModel.id, input.topicId),
          eq(couponTopicModel.workspaceId, input.workspaceId),
          eq(couponTopicModel.status, couponTopicStatuses.enum.active),
          isNull(couponTopicModel.deletedAt),
          or(
            isNull(couponTopicModel.expiresAt),
            gt(couponTopicModel.expiresAt, now),
          ),
        ),
      )
      .limit(1)
    return row
  },
}
