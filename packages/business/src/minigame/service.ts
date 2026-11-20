import {
  and,
  type DatabaseClient,
  db,
  eq,
  ilike,
  isUniqueViolationError,
} from "@chatbotx.io/database/client"
import type {
  MinigameAppearance,
  MinigameGeneralSettings,
  MinigameNonWinningMessageSettings,
  MinigamePlayerSettings,
  MinigamePrizeSettings,
  MinigameType,
  MinigameWinningMessageSettings,
} from "@chatbotx.io/database/partials"
import { minigameRepository } from "@chatbotx.io/database/repositories"
import { minigameModel } from "@chatbotx.io/database/schema"
import type { MinigameModel } from "@chatbotx.io/database/types"
import {
  deleteByIdsInWorkspace,
  getPaginationWithDefaults,
  likeContains,
  parseOrderBy,
} from "@chatbotx.io/database/utils"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"
import {
  type CopyNameOptions,
  copyNamePrefix,
  insertWithFreeCopyName,
} from "../lib/copy-name"
import {
  assertReferencable,
  assertResourceEditable,
  changedKeysOf,
  withDeleteGuard,
} from "../template/installed-resource.service"
import { withTemplateLockedTransaction } from "../template/template-resource-locks"

/** `minigameGeneralSettingsSchema.name` allows up to 150 characters. */
const MINIGAME_NAME_MAX_LENGTH = 150

/** How minigame copies are named: `<name> - Copy`, `<name> - Copy 2`, … */
const MINIGAME_COPY_NAME: CopyNameOptions = {
  style: "dash",
  maxLength: MINIGAME_NAME_MAX_LENGTH,
}

/**
 * A copy starts with no prizes: every play is a loss until the admin adds
 * prizes, so `loseRate` becomes 100 to keep the 100% total valid. The
 * no-prize outcome's label/image and the prize-name custom field are kept.
 */
function withoutPrizes(
  prizeSettings: MinigamePrizeSettings,
): MinigamePrizeSettings {
  return {
    ...prizeSettings,
    prizes: [],
    nonWinning: { ...prizeSettings.nonWinning, loseRate: 100 },
  }
}

/**
 * The prize description image pictures the source's prizes, which the copy
 * does not have, so the copy starts without it. Other images are kept.
 */
function withoutPrizeImage(appearance: MinigameAppearance): MinigameAppearance {
  return { ...appearance, prizeDescriptionImage: { mode: "file", url: "" } }
}

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

type PartialUpdateInput = { workspaceId: string; id: string } & Partial<
  Omit<UpsertInput, "workspaceId">
>

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

/** The flows a minigame's settings point at (sharing and follow-up messages). */
function referencedFlowParents(
  input: Partial<
    Pick<
      UpsertInput,
      "playerSettings" | "winningMessageSettings" | "nonWinningMessageSettings"
    >
  >,
): { kind: "flow"; resourceId: string }[] {
  const ids = new Set<string>()
  const sharingFlowId = input.playerSettings?.sharingFlowId
  if (sharingFlowId) {
    ids.add(sharingFlowId)
  }
  for (const settings of [
    input.winningMessageSettings,
    input.nonWinningMessageSettings,
  ]) {
    const message = settings?.outcomeMessage
    if (message && message.mode !== "text" && message.flowId) {
      ids.add(message.flowId)
    }
  }
  return [...ids].map((resourceId) => ({ kind: "flow", resourceId }))
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

  /**
   * `Minigame_workspaceId_name_key` is the only unique index on the table, so a
   * unique violation from create/update is always a duplicate name. Mapped here
   * (not in each caller) so the public API and the builder form get the same
   * failure — see `possibleErrorsOnCreatingMinigame` in
   * `apps/builder/src/lib/orpc/orpc-error-helper.ts`.
   */
  private rethrowNameConflict(error: unknown): never {
    if (isUniqueViolationError(error)) {
      throw new ChatbotXException(
        "Minigame name already exists",
        "nameAlreadyExists",
        409,
      )
    }
    throw error
  }

  /** The row write of `create`, shared with the template install (`enabled` defaults on). */
  async insertInTx(
    tx: DatabaseClient,
    input: UpsertInput & { enabled?: boolean },
  ): Promise<MinigameModel> {
    const [row] = await tx
      .insert(minigameModel)
      .values({
        workspaceId: input.workspaceId,
        enabled: input.enabled,
        ...this.toColumns(input),
      })
      .returning()
    return row
  }

  async create(input: UpsertInput): Promise<MinigameModel> {
    const parents = referencedFlowParents(input)
    try {
      if (parents.length === 0) {
        return await this.insertInTx(db, input)
      }
      // A flow the settings point at must not be one an uninstall is deleting:
      // the reference lives in JSON, so no foreign key would catch it.
      return await withTemplateLockedTransaction(
        async (tx) => {
          await assertReferencable({
            workspaceId: input.workspaceId,
            parents,
            tx,
          })
          return await this.insertInTx(tx, input)
        },
        { workspaceId: input.workspaceId, initialKeys: parents },
      )
    } catch (error) {
      this.rethrowNameConflict(error)
    }
  }

  async update(
    input: UpsertInput & {
      id: string
      originalPrizeQuantities?: Record<string, number | undefined> | null
    },
  ): Promise<MinigameModel> {
    const { originalPrizeQuantities = {} } = input

    try {
      return await withTemplateLockedTransaction(
        async (tx) => {
          const [current] = await tx
            .select()
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

          // `null` = "no form-load baseline" (a public-API write, not the builder
          // form): honor the submitted quantities verbatim, including clearing a
          // tracked quantity back to `undefined`. `{}` (the builder default) means
          // "baseline unknown for every prize", which `reconcilePrizeQuantities`
          // reads as untouched and therefore keeps the DB's live, play-decremented
          // value.
          const reconciledPrizeSettings =
            originalPrizeQuantities === null
              ? input.prizeSettings
              : reconcilePrizeQuantities(
                  input.prizeSettings,
                  current.prizeSettings,
                  originalPrizeQuantities,
                )

          const columns = this.toColumns({
            ...input,
            prizeSettings: reconciledPrizeSettings,
          })
          await assertResourceEditable({
            workspaceId: input.workspaceId,
            resourceKind: "minigame",
            resourceIds: [input.id],
            changedKeys: changedKeysOf(current, columns),
            referencedParents: referencedFlowParents(input),
            tx,
          })
          const [updated] = await tx
            .update(minigameModel)
            .set(columns)
            .where(
              and(
                eq(minigameModel.id, input.id),
                eq(minigameModel.workspaceId, input.workspaceId),
              ),
            )
            .returning()

          return updated
        },
        this.lockOf(input, referencedFlowParents(input)),
      )
    } catch (error) {
      this.rethrowNameConflict(error)
    }
  }

  private lockOf(
    input: { workspaceId: string; id: string },
    flows: readonly { kind: "flow"; resourceId: string }[] = [],
  ) {
    return {
      workspaceId: input.workspaceId,
      initialKeys: [
        { kind: "minigame" as const, resourceId: input.id },
        ...flows,
      ],
    }
  }

  /**
   * Partial update for the public API's PATCH route: merges only the
   * top-level settings objects the caller actually sent over the current
   * row, so omitting `prizeSettings` preserves live, play-decremented stock
   * instead of the full-replace `update()`'s "resubmit everything" contract.
   * Never deep-merges into a jsonb settings object — a caller who sends
   * `prizeSettings` sends the whole object, keeping
   * `isMinigameProbabilityTotalValid`'s 100%-sum check meaningful.
   */
  async updatePartial(input: PartialUpdateInput): Promise<MinigameModel> {
    try {
      return await withTemplateLockedTransaction(
        async (tx) => {
          const [current] = await tx
            .select()
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

          const merged: UpsertInput = {
            workspaceId: input.workspaceId,
            type: input.type ?? current.type,
            generalSettings: input.generalSettings ?? current.generalSettings,
            appearance: input.appearance ?? current.appearance,
            playerSettings: input.playerSettings ?? current.playerSettings,
            prizeSettings: input.prizeSettings ?? current.prizeSettings,
            winningMessageSettings:
              input.winningMessageSettings ?? current.winningMessageSettings,
            nonWinningMessageSettings:
              input.nonWinningMessageSettings ??
              current.nonWinningMessageSettings,
          }

          const columns = this.toColumns(merged)
          await assertResourceEditable({
            workspaceId: input.workspaceId,
            resourceKind: "minigame",
            resourceIds: [input.id],
            changedKeys: changedKeysOf(current, columns),
            referencedParents: referencedFlowParents(merged),
            tx,
          })
          const [updated] = await tx
            .update(minigameModel)
            .set(columns)
            .where(
              and(
                eq(minigameModel.id, input.id),
                eq(minigameModel.workspaceId, input.workspaceId),
              ),
            )
            .returning()

          return updated
        },
        this.lockOf(input, referencedFlowParents(input)),
      )
    } catch (error) {
      this.rethrowNameConflict(error)
    }
  }

  /**
   * Copies a minigame's settings into a new minigame named `<name> - Copy`
   * (then `- Copy 2`, `- Copy 3`, … while taken). Prizes and the prize
   * description image are not copied (see `withoutPrizes`,
   * `withoutPrizeImage`); plays, players, and counters start from zero. The
   * copy starts disabled so its play link is not live before it has prizes.
   */
  async duplicate(input: {
    workspaceId: string
    id: string
  }): Promise<MinigameModel> {
    // The flows the source points at are locked with it; read outside the
    // lock only to know which ones (a changed set retries the transaction).
    const preview = await this.find(input)
    const copy = await withTemplateLockedTransaction(
      async (tx) => {
        const source = await tx.query.minigameModel.findFirst({
          where: { id: input.id, workspaceId: input.workspaceId },
        })
        if (!source) {
          throw notFoundException("Minigame not found")
        }
        // The copy keeps the source's images and flow links, so an uninstall
        // that is deciding what to keep must not run between the read and the
        // insert: this takes the source's lock and refuses a tombstoned one.
        await assertResourceEditable({
          workspaceId: input.workspaceId,
          resourceKind: "minigame",
          resourceIds: [source.id],
          changedKeys: [],
          referencedParents: referencedFlowParents(source),
          tx,
        })
        const taken = new Set(
          await minigameRepository.listNamesWithPrefix(
            {
              workspaceId: input.workspaceId,
              prefix: copyNamePrefix(source.name, MINIGAME_COPY_NAME),
            },
            tx,
          ),
        )
        // A savepoint per candidate: a name taken by a concurrent copy must
        // not abort the transaction.
        return await insertWithFreeCopyName({
          constraint: "Minigame_workspaceId_name_key",
          base: source.name,
          taken,
          options: MINIGAME_COPY_NAME,
          insert: (name) =>
            tx.transaction((savepoint) =>
              this.insertInTx(savepoint, {
                workspaceId: input.workspaceId,
                enabled: false,
                type: source.type,
                generalSettings: { ...source.generalSettings, name },
                appearance: withoutPrizeImage(source.appearance),
                playerSettings: source.playerSettings,
                prizeSettings: withoutPrizes(source.prizeSettings),
                winningMessageSettings: source.winningMessageSettings,
                nonWinningMessageSettings: source.nonWinningMessageSettings,
              }),
            ),
        })
      },
      this.lockOf(input, referencedFlowParents(preview)),
    )

    if (copy) {
      return copy
    }
    throw new ChatbotXException(
      "Minigame name already exists",
      "nameAlreadyExists",
      409,
    )
  }

  async setEnabled(
    ctx: { workspaceId: string; id: string },
    enabled: boolean,
  ): Promise<MinigameModel> {
    return await withTemplateLockedTransaction(async (tx) => {
      // The toggle is installer-owned; this only refuses while an uninstall runs.
      await assertResourceEditable({
        workspaceId: ctx.workspaceId,
        resourceKind: "minigame",
        resourceIds: [ctx.id],
        changedKeys: [],
        tx,
      })
      const [updated] = await tx
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
    }, this.lockOf(ctx))
  }

  async delete(input: { workspaceId: string; id: string }): Promise<void> {
    await this.find(input)
    await this.deleteMany({ workspaceId: input.workspaceId, ids: [input.id] })
  }

  async deleteMany(input: {
    workspaceId: string
    ids: string[]
  }): Promise<void> {
    if (input.ids.length === 0) {
      return
    }
    await withDeleteGuard(
      {
        workspaceId: input.workspaceId,
        targets: [{ resourceKind: "minigame", resourceIds: input.ids }],
      },
      (tx) => this.deleteInTx(tx, input),
    )
  }

  /**
   * The delete core (row write only; plays and players cascade), shared with
   * the template uninstall so there is one implementation. Returns the ids deleted.
   */
  async deleteInTx(
    tx: DatabaseClient,
    input: { workspaceId: string; ids: string[] },
  ): Promise<string[]> {
    return await deleteByIdsInWorkspace(tx, minigameModel, input)
  }
}

export const minigameService = new MinigameService()
