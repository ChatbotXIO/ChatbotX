import { and, db, eq, ilike } from "@chatbotx.io/database/client"
import type {
  MinigameAppearance,
  MinigameGeneralSettings,
  MinigameNonWinningMessageSettings,
  MinigamePlayerSettings,
  MinigamePrizeSettings,
  MinigameType,
  MinigameWinningMessageSettings,
} from "@chatbotx.io/database/partials"
import { minigameModel } from "@chatbotx.io/database/schema"
import type { MinigameModel } from "@chatbotx.io/database/types"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderBy,
} from "@chatbotx.io/database/utils"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"

type ListInput = {
  workspaceId: string
  page?: number
  perPage?: number
  name?: string
  sort?: { id: string; desc: boolean }[]
}

type UpsertInput = {
  workspaceId: string
  type: MinigameType
  generalSettings: MinigameGeneralSettings
  appearance: MinigameAppearance
  playerSettings: MinigamePlayerSettings
  prizeSettings: MinigamePrizeSettings
  winningMessageSettings: MinigameWinningMessageSettings
  nonWinningMessageSettings: MinigameNonWinningMessageSettings
}

class MinigameService extends BaseService {
  async list(input: ListInput) {
    const pagination = getPaginationWithDefaults(input)
    const whereSQL = and(
      eq(minigameModel.workspaceId, input.workspaceId),
      input.name
        ? ilike(minigameModel.name, likeContains(input.name))
        : undefined,
    )
    const orderBy = parseOrderBy(minigameModel, input)

    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(minigameModel)
        .where(whereSQL)
        .orderBy(...orderBy)
        .limit(pagination.limit)
        .offset(pagination.offset),
      db.$count(minigameModel, whereSQL),
    ])

    return {
      data: rows,
      pageCount: Math.ceil(totalRows / (input.perPage ?? pagination.limit)),
    }
  }

  async find(input: {
    workspaceId: string
    id: string
  }): Promise<MinigameModel> {
    const row = await db.query.minigameModel.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
    })
    if (!row) {
      throw notFoundException("Minigame not found")
    }
    return row
  }

  /**
   * Looks up a minigame by id alone, with no workspace scoping — used by the
   * public gameplay page/action, which receives no workspaceId in its URL.
   */
  async findUnscoped(id: string): Promise<MinigameModel | null> {
    return (await db.query.minigameModel.findFirst({ where: { id } })) ?? null
  }

  async create(input: UpsertInput): Promise<MinigameModel> {
    const [row] = await db
      .insert(minigameModel)
      .values({
        workspaceId: input.workspaceId,
        name: input.generalSettings.name,
        type: input.type,
        generalSettings: input.generalSettings,
        appearance: input.appearance,
        playerSettings: input.playerSettings,
        prizeSettings: input.prizeSettings,
        winningMessageSettings: input.winningMessageSettings,
        nonWinningMessageSettings: input.nonWinningMessageSettings,
      })
      .returning()

    return row
  }

  async update(input: UpsertInput & { id: string }): Promise<MinigameModel> {
    await this.find({ workspaceId: input.workspaceId, id: input.id })

    await db
      .update(minigameModel)
      .set({
        name: input.generalSettings.name,
        type: input.type,
        generalSettings: input.generalSettings,
        appearance: input.appearance,
        playerSettings: input.playerSettings,
        prizeSettings: input.prizeSettings,
        winningMessageSettings: input.winningMessageSettings,
        nonWinningMessageSettings: input.nonWinningMessageSettings,
      })
      .where(
        and(
          eq(minigameModel.id, input.id),
          eq(minigameModel.workspaceId, input.workspaceId),
        ),
      )

    return await this.find({ workspaceId: input.workspaceId, id: input.id })
  }

  async setEnabled(
    ctx: { workspaceId: string; id: string },
    enabled: boolean,
  ): Promise<MinigameModel> {
    await this.find(ctx)

    await db
      .update(minigameModel)
      .set({ enabled })
      .where(
        and(
          eq(minigameModel.id, ctx.id),
          eq(minigameModel.workspaceId, ctx.workspaceId),
        ),
      )

    return await this.find(ctx)
  }

  async delete(input: { workspaceId: string; id: string }): Promise<void> {
    await this.find(input)

    await db
      .delete(minigameModel)
      .where(
        and(
          eq(minigameModel.id, input.id),
          eq(minigameModel.workspaceId, input.workspaceId),
        ),
      )
  }
}

export const minigameService = new MinigameService()
