import {
  and,
  count,
  type DatabaseClient,
  db,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "../../client"
import type {
  FacebookMarketingMessageBudgetType,
  FacebookMarketingMessageStatus,
  FacebookMarketingMessagesAuthStatus,
  FacebookMarketingMessageTargetType,
} from "../../partials/facebook-marketing-messages"
import {
  facebookMarketingMessageModel,
  facebookMarketingMessagesAuthModel,
} from "../../schema"
import type {
  FacebookMarketingMessageModel,
  FacebookMarketingMessagesAuthModel,
} from "../../types"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderBy,
} from "../../utils"

export type MarketingMessageStatisticsListInput = {
  workspaceId: string
  adAccountId: string
  /** Exact Meta id (`campaignId`) or a substring of the name. */
  search?: string
  page?: number
  perPage?: number
  sort?: { id: "campaignId" | "name"; desc: boolean }[]
}

export type MarketingMessageAdAccountSummary = {
  adAccountId: string
  currency: string
  timezoneName: string | null
}

const STATISTICS_SORTABLE_COLUMNS: ReadonlySet<string> = new Set([
  "campaignId",
  "name",
])

export const facebookMarketingMessagesAuthRepository = {
  async findByWorkspaceId(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<FacebookMarketingMessagesAuthModel | null> {
    const row = await tx.query.facebookMarketingMessagesAuthModel.findFirst({
      where: { workspaceId },
    })
    return row ?? null
  },

  async create(
    input: {
      id: string
      workspaceId: string
      auth: unknown
      tokenExpiresAt: Date | null
      facebookUserId: string | null
    },
    tx: DatabaseClient = db,
  ): Promise<FacebookMarketingMessagesAuthModel> {
    const [row] = await tx
      .insert(facebookMarketingMessagesAuthModel)
      .values({ ...input, status: "active" })
      .returning()
    if (!row) {
      throw new Error("Failed to create FacebookMarketingMessagesAuth")
    }
    return row
  },

  /** Re-grant: replaces the token and clears any `invalid` status. */
  async updateAuth(
    input: {
      id: string
      auth: unknown
      tokenExpiresAt: Date | null
      facebookUserId: string | null
    },
    tx: DatabaseClient = db,
  ): Promise<FacebookMarketingMessagesAuthModel | null> {
    const [row] = await tx
      .update(facebookMarketingMessagesAuthModel)
      .set({
        auth: input.auth,
        tokenExpiresAt: input.tokenExpiresAt,
        facebookUserId: input.facebookUserId,
        status: "active",
      })
      .where(eq(facebookMarketingMessagesAuthModel.id, input.id))
      .returning()
    return row ?? null
  },

  async updateStatus(
    input: { workspaceId: string; status: FacebookMarketingMessagesAuthStatus },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(facebookMarketingMessagesAuthModel)
      .set({ status: input.status })
      .where(
        eq(facebookMarketingMessagesAuthModel.workspaceId, input.workspaceId),
      )
  },
}

type CreateFacebookMarketingMessageInput = {
  id: string
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
  audienceId: string | null
  campaignId: string
  facebookUserId: string | null
  status?: FacebookMarketingMessageStatus
  startsAt?: Date | null
}

export const facebookMarketingMessageRepository = {
  async listByWorkspaceId(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<FacebookMarketingMessageModel[]> {
    return await tx.query.facebookMarketingMessageModel.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    })
  },

  async listForStatistics(
    input: MarketingMessageStatisticsListInput,
    tx: DatabaseClient = db,
  ): Promise<{
    data: FacebookMarketingMessageModel[]
    total: number
    pageCount: number
  }> {
    const search = input.search?.trim()
    const where = and(
      eq(facebookMarketingMessageModel.workspaceId, input.workspaceId),
      eq(facebookMarketingMessageModel.adAccountId, input.adAccountId),
      search
        ? or(
            eq(facebookMarketingMessageModel.campaignId, search),
            ilike(facebookMarketingMessageModel.name, likeContains(search)),
          )
        : undefined,
    )
    const pagination = getPaginationWithDefaults(input)
    const orderBy = parseOrderBy(
      facebookMarketingMessageModel,
      input,
      STATISTICS_SORTABLE_COLUMNS,
    )
    const [data, total] = await Promise.all([
      tx
        .select()
        .from(facebookMarketingMessageModel)
        .where(where)
        .orderBy(
          ...(orderBy.length > 0
            ? orderBy
            : [desc(facebookMarketingMessageModel.createdAt)]),
          // Tiebreaker so equal names/timestamps cannot repeat or skip rows
          // across pages.
          desc(facebookMarketingMessageModel.id),
        )
        .limit(pagination.limit)
        .offset(pagination.offset),
      tx.$count(facebookMarketingMessageModel, where),
    ])
    return { data, total, pageCount: Math.ceil(total / pagination.limit) }
  },

  /**
   * One entry per ad account the workspace has campaigns on, newest-used
   * first (index 0 is the Statistics tab's default). `currency` and
   * `timezoneName` come from that account's newest campaign — the fallback
   * when the current grant can no longer see the account on Meta.
   */
  async listAdAccountsByWorkspaceId(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<MarketingMessageAdAccountSummary[]> {
    const rows = await tx
      .selectDistinctOn([facebookMarketingMessageModel.adAccountId], {
        adAccountId: facebookMarketingMessageModel.adAccountId,
        currency: facebookMarketingMessageModel.currency,
        timezoneName: facebookMarketingMessageModel.timezoneName,
        createdAt: facebookMarketingMessageModel.createdAt,
      })
      .from(facebookMarketingMessageModel)
      .where(eq(facebookMarketingMessageModel.workspaceId, workspaceId))
      .orderBy(
        facebookMarketingMessageModel.adAccountId,
        desc(facebookMarketingMessageModel.createdAt),
      )
    return rows
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(({ createdAt: _createdAt, ...account }) => account)
  },

  async findForWorkspace(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<FacebookMarketingMessageModel | null> {
    const row = await tx.query.facebookMarketingMessageModel.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
    })
    return row ?? null
  },

  async create(
    input: CreateFacebookMarketingMessageInput,
    tx: DatabaseClient = db,
  ): Promise<FacebookMarketingMessageModel> {
    const [row] = await tx
      .insert(facebookMarketingMessageModel)
      .values(input)
      .returning()
    if (!row) {
      throw new Error("Failed to create FacebookMarketingMessage")
    }
    return row
  },

  /**
   * Only the mutable fields. `adAccountId`, `pageId` and `campaignId` are
   * frozen after creation — changing the account or Page means a different
   * Meta campaign, not an edit of this one.
   *
   * `content` is written only when given. With `lockContent` the write only
   * lands while nothing has been sent and the campaign has not started
   * (`notSent`/`scheduled`), so a content edit can never race the first send;
   * null then means the content is locked.
   */
  async update(
    input: {
      id: string
      workspaceId: string
      name: string
      budgetType: FacebookMarketingMessageBudgetType
      budgetMinorUnits: number
      content?: unknown
      lockContent?: boolean
    },
    tx: DatabaseClient = db,
  ): Promise<FacebookMarketingMessageModel | null> {
    const [row] = await tx
      .update(facebookMarketingMessageModel)
      .set({
        name: input.name,
        budgetType: input.budgetType,
        budgetMinorUnits: input.budgetMinorUnits,
        ...(input.content === undefined ? {} : { content: input.content }),
      })
      .where(
        and(
          eq(facebookMarketingMessageModel.id, input.id),
          eq(facebookMarketingMessageModel.workspaceId, input.workspaceId),
          input.lockContent
            ? and(
                isNull(facebookMarketingMessageModel.firstSentAt),
                inArray(facebookMarketingMessageModel.status, [
                  "notSent",
                  "scheduled",
                ]),
              )
            : undefined,
        ),
      )
      .returning()
    return row ?? null
  },

  async countByAudienceId(
    input: { audienceId: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<number> {
    const [row] = await tx
      .select({ value: count() })
      .from(facebookMarketingMessageModel)
      .where(
        and(
          eq(facebookMarketingMessageModel.audienceId, input.audienceId),
          eq(facebookMarketingMessageModel.workspaceId, input.workspaceId),
        ),
      )
    return row?.value ?? 0
  },

  async remove(
    input: { ids: string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    if (input.ids.length === 0) {
      return
    }
    await tx
      .delete(facebookMarketingMessageModel)
      .where(
        and(
          inArray(facebookMarketingMessageModel.id, input.ids),
          eq(facebookMarketingMessageModel.workspaceId, input.workspaceId),
        ),
      )
  },

  /**
   * Campaigns ready to start: scheduled and due (and past any token-snapshot
   * retry backoff, which reuses `nextDayAt`), or waiting for the next day.
   */
  async listDueToStart(
    now: Date,
    tx: DatabaseClient = db,
  ): Promise<FacebookMarketingMessageModel[]> {
    return await tx
      .select()
      .from(facebookMarketingMessageModel)
      .where(
        or(
          and(
            eq(facebookMarketingMessageModel.status, "scheduled"),
            lte(facebookMarketingMessageModel.startsAt, now),
            or(
              isNull(facebookMarketingMessageModel.nextDayAt),
              lte(facebookMarketingMessageModel.nextDayAt, now),
            ),
          ),
          and(
            eq(facebookMarketingMessageModel.status, "waitingNextDay"),
            lte(facebookMarketingMessageModel.nextDayAt, now),
          ),
        ),
      )
  },

  async listByStatus(
    status: FacebookMarketingMessageStatus,
    tx: DatabaseClient = db,
  ): Promise<FacebookMarketingMessageModel[]> {
    return await tx
      .select()
      .from(facebookMarketingMessageModel)
      .where(eq(facebookMarketingMessageModel.status, status))
  },

  /** Unscoped by workspace — for the delivery state machine (worker/cron). */
  async findById(
    id: string,
    tx: DatabaseClient = db,
  ): Promise<FacebookMarketingMessageModel | null> {
    const row = await tx.query.facebookMarketingMessageModel.findFirst({
      where: { id },
    })
    return row ?? null
  },

  /** Unscoped by workspace — for webhooks that only know the Meta campaign id. */
  async findByCampaignId(
    campaignId: string,
    tx: DatabaseClient = db,
  ): Promise<FacebookMarketingMessageModel | null> {
    const row = await tx.query.facebookMarketingMessageModel.findFirst({
      where: { campaignId },
    })
    return row ?? null
  },

  /** Conditional update; returns null when another worker won the race. */
  async transition(
    input: {
      id: string
      from: FacebookMarketingMessageStatus[]
      patch: Partial<
        Omit<
          typeof facebookMarketingMessageModel.$inferInsert,
          "id" | "workspaceId" | "campaignId"
        >
      >
    },
    tx: DatabaseClient = db,
  ): Promise<FacebookMarketingMessageModel | null> {
    if (input.from.length === 0) {
      return null
    }
    const [row] = await tx
      .update(facebookMarketingMessageModel)
      .set(input.patch)
      .where(
        and(
          eq(facebookMarketingMessageModel.id, input.id),
          inArray(facebookMarketingMessageModel.status, input.from),
        ),
      )
      .returning()
    return row ?? null
  },

  async incrementDaySent(
    input: { id: string; by: number },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(facebookMarketingMessageModel)
      .set({
        daySent: sql`${facebookMarketingMessageModel.daySent} + ${input.by}`,
      })
      .where(eq(facebookMarketingMessageModel.id, input.id))
  },

  /** Sets `firstSentAt` only when it is still null (locks the content). */
  async setFirstSentAt(id: string, tx: DatabaseClient = db): Promise<void> {
    await tx
      .update(facebookMarketingMessageModel)
      .set({ firstSentAt: new Date() })
      .where(
        and(
          eq(facebookMarketingMessageModel.id, id),
          isNull(facebookMarketingMessageModel.firstSentAt),
        ),
      )
  },
}
