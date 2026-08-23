import { and, db, eq, ilike, inArray } from "@chatbotx.io/database/client"
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

/**
 * `quantity` is admin-editable config AND live inventory decremented by
 * `MinigameContactService.drawPrize` under a row lock. The builder form
 * loads the full `prizeSettings` once at open and resubmits it whole, so a
 * save unrelated to prizes could otherwise silently revert quantity decrements
 * that happened while the admin was editing. `originalPrizeQuantities` is the
 * baseline captured client-side when the form loaded (NOT the current DB
 * value) — if a prize's submitted quantity still matches that baseline, the
 * admin didn't touch it, so the DB's current (possibly-decremented) quantity
 * is preserved; otherwise the admin's new value is honored.
 */
function reconcilePrizeQuantities(
  submitted: MinigamePrizeSettings,
  current: MinigamePrizeSettings,
  originalPrizeQuantities: Record<string, number | undefined>,
): MinigamePrizeSettings {
  const liveQuantitiesById = new Map(
    current.prizes.map((prize) => [prize.id, prize.quantity]),
  )

  return {
    ...submitted,
    prizes: submitted.prizes.map((prize) => {
      const liveQuantity = liveQuantitiesById.get(prize.id)
      const untouchedSinceFormLoad =
        liveQuantity !== undefined &&
        prize.quantity === originalPrizeQuantities[prize.id]

      return untouchedSinceFormLoad
        ? { ...prize, quantity: liveQuantity }
        : prize
    }),
  }
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

  private toColumns(input: UpsertInput) {
    return {
      name: input.generalSettings.name,
      type: input.type,
      generalSettings: input.generalSettings,
      appearance: input.appearance,
      playerSettings: input.playerSettings,
      prizeSettings: input.prizeSettings,
      winningMessageSettings: input.winningMessageSettings,
      nonWinningMessageSettings: input.nonWinningMessageSettings,
    }
  }

  async create(input: UpsertInput): Promise<MinigameModel> {
    const [row] = await db
      .insert(minigameModel)
      .values({ workspaceId: input.workspaceId, ...this.toColumns(input) })
      .returning()

    return row
  }

  async update(
    input: UpsertInput & {
      id: string
      originalPrizeQuantities?: Record<string, number | undefined>
    },
  ): Promise<MinigameModel> {
    const { originalPrizeQuantities = {} } = input

    return await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ prizeSettings: minigameModel.prizeSettings })
        .from(minigameModel)
        .where(
          and(
            eq(minigameModel.id, input.id),
            eq(minigameModel.workspaceId, input.workspaceId),
          ),
        )
        .for("update")

      if (!current) {
        throw notFoundException("Minigame not found")
      }

      const reconciledPrizeSettings = reconcilePrizeQuantities(
        input.prizeSettings,
        current.prizeSettings,
        originalPrizeQuantities,
      )

      const [updated] = await tx
        .update(minigameModel)
        .set(
          this.toColumns({ ...input, prizeSettings: reconciledPrizeSettings }),
        )
        .where(
          and(
            eq(minigameModel.id, input.id),
            eq(minigameModel.workspaceId, input.workspaceId),
          ),
        )
        .returning()

      return updated
    })
  }

  async setEnabled(
    ctx: { workspaceId: string; id: string },
    enabled: boolean,
  ): Promise<MinigameModel> {
    const [updated] = await db
      .update(minigameModel)
      .set({ enabled })
      .where(
        and(
          eq(minigameModel.id, ctx.id),
          eq(minigameModel.workspaceId, ctx.workspaceId),
        ),
      )
      .returning()

    if (!updated) {
      throw notFoundException("Minigame not found")
    }

    return updated
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

  async deleteMany(input: {
    workspaceId: string
    ids: string[]
  }): Promise<void> {
    if (input.ids.length === 0) {
      return
    }

    await db
      .delete(minigameModel)
      .where(
        and(
          eq(minigameModel.workspaceId, input.workspaceId),
          inArray(minigameModel.id, input.ids),
        ),
      )
  }
}

export const minigameService = new MinigameService()
