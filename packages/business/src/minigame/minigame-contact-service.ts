import {
  and,
  asc,
  count,
  type DatabaseClient,
  db,
  desc,
  eq,
  ilike,
} from "@chatbotx.io/database/client"
import type {
  ChannelType,
  MinigameLoseMessage,
  MinigamePlayerSettings,
  MinigamePrizeSettings,
  MinigamePrizeWinMessage,
} from "@chatbotx.io/database/partials"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import {
  contactModel,
  conversationModel,
  minigameContactModel,
  minigameModel,
  minigamePlayModel,
} from "@chatbotx.io/database/schema"
import type {
  ContactInboxModel,
  MinigameContactModel,
  MinigameModel,
} from "@chatbotx.io/database/types"
import {
  getPaginationWithDefaults,
  likeContains,
} from "@chatbotx.io/database/utils"
import {
  ChatJobAction,
  chatQueue,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { normalizeError } from "universal-error-normalizer"
import { BaseService } from "../base.service"
import { contactInboxService } from "../contact-inbox/service"
import { conversationService } from "../conversation/service"
import { ChatbotXException } from "../errors"
import { logger } from "../logger"
import { tagService } from "../tag/service"
import { type MinigamePlayResult, resolveMinigamePrize } from "./resolve-prize"
import { minigameService } from "./service"

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const MAX_PLAY_RECORDS = 200

type MinigameContactListSort = { id: string; desc: boolean }[]

export function getMinigameContactListOrder(sort?: MinigameContactListSort) {
  const activeSort = sort?.[0]
  if (!activeSort) {
    return desc(minigameContactModel.updatedAt)
  }

  switch (activeSort.id) {
    case "name":
      return activeSort.desc
        ? desc(contactModel.fullName)
        : asc(contactModel.fullName)
    case "played":
      return activeSort.desc
        ? desc(minigameContactModel.played)
        : asc(minigameContactModel.played)
    case "remaining":
      return activeSort.desc
        ? desc(minigameContactModel.remaining)
        : asc(minigameContactModel.remaining)
    case "openedAt":
      return activeSort.desc
        ? desc(minigameContactModel.openedAt)
        : asc(minigameContactModel.openedAt)
    case "lastPlayedAt":
      return activeSort.desc
        ? desc(minigameContactModel.updatedAt)
        : asc(minigameContactModel.updatedAt)
    default:
      return desc(minigameContactModel.updatedAt)
  }
}

class MinigameContactService extends BaseService {
  /**
   * Finds or creates the per-contact play-state row for a minigame, applying
   * the `everyNDays` reset policy (using `updatedAt` as the "last touched"
   * marker — the table has no dedicated last-reset column) before returning.
   * Pass `forUpdate: true` from inside a transaction to lock the row against
   * concurrent plays.
   */
  async resolvePlayState(props: {
    minigameId: string
    contactId: string
    playerSettings: MinigamePlayerSettings
    tx?: DatabaseClient
    forUpdate?: boolean
  }): Promise<MinigameContactModel> {
    const {
      minigameId,
      contactId,
      playerSettings,
      tx = db,
      forUpdate = false,
    } = props

    const findExisting = async () =>
      forUpdate
        ? (
            await tx
              .select()
              .from(minigameContactModel)
              .where(
                and(
                  eq(minigameContactModel.minigameId, minigameId),
                  eq(minigameContactModel.contactId, contactId),
                ),
              )
              .for("update")
          )[0]
        : await tx.query.minigameContactModel.findFirst({
            where: { minigameId, contactId },
          })

    let existing = await findExisting()

    if (!existing) {
      // `onConflictDoNothing` returns no row on conflict WITHOUT raising an
      // error, unlike a bare INSERT — two concurrent first-plays for the same
      // (minigameId, contactId) would otherwise both pass the `!existing`
      // check above and race on `MinigameContact_minigameId_contactId_key`,
      // throwing an uncaught unique-violation. This branch runs both inside
      // `recordPlay`'s locking transaction (`forUpdate: true`) and standalone
      // from the opener-tracking page render, which has no transaction to
      // retry inside — `ON CONFLICT DO NOTHING` blocks on a concurrently
      // in-flight conflicting insert and only resolves once it commits, so
      // the re-select below is guaranteed to see the row.
      const [created] = await tx
        .insert(minigameContactModel)
        .values({
          minigameId,
          contactId,
          openedAt: new Date(),
          remaining: playerSettings.drawsPerPerson,
          played: 0,
        })
        .onConflictDoNothing()
        .returning()

      if (created) {
        return created
      }

      existing = await findExisting()
      if (!existing) {
        throw new Error(
          "MinigameContact insert conflicted but no existing row found",
        )
      }
    }

    if (
      playerSettings.resetPolicy === "everyNDays" &&
      Date.now() - existing.updatedAt.getTime() >=
        playerSettings.resetIntervalDays * ONE_DAY_MS
    ) {
      const [updated] = await tx
        .update(minigameContactModel)
        .set({ remaining: playerSettings.drawsPerPerson })
        .where(eq(minigameContactModel.id, existing.id))
        .returning()
      return updated
    }

    return existing
  }

  /**
   * Resolves the prize for a draw, excluding any prize whose tracked
   * `quantity` has already hit 0 — its winRate silently falls through to
   * `nonWinning` (no redistribution). Always re-reads `prizeSettings` under
   * `FOR UPDATE` first and derives `hasTrackedQuantity` from that fresh,
   * locked read — never from a caller-supplied snapshot — since an admin can
   * toggle quantity tracking on a prize between the caller fetching the
   * minigame (before the transaction opens) and this call, which would
   * otherwise skip the lock entirely and let two concurrent plays both read
   * the same remaining stock and both win the last unit of a capped prize.
   * The single-row, indexed-PK lock is effectively free even for minigames
   * with no tracked quantity, trading the old "no lock at all" optimization
   * for correctness — every play of the same minigame now serializes on this
   * row for the duration of `recordPlay`'s transaction. The caller must
   * persist the decremented stock using the same locked `prizeSettings` this
   * returns.
   */
  private async drawPrize(props: {
    minigameId: string
    tx: DatabaseClient
  }): Promise<{
    result: MinigamePlayResult
    prizeSettings: MinigamePrizeSettings
  }> {
    const { minigameId, tx } = props

    const [row] = await tx
      .select({ prizeSettings: minigameModel.prizeSettings })
      .from(minigameModel)
      .where(eq(minigameModel.id, minigameId))
      .for("update")

    const lockedPrizeSettings = row.prizeSettings
    const hasTrackedQuantity = lockedPrizeSettings.prizes.some(
      (prize) => prize.quantity !== undefined,
    )
    if (!hasTrackedQuantity) {
      return {
        result: resolveMinigamePrize(lockedPrizeSettings),
        prizeSettings: lockedPrizeSettings,
      }
    }

    const availablePrizes = lockedPrizeSettings.prizes.filter(
      (prize) => prize.quantity === undefined || prize.quantity > 0,
    )
    const result = resolveMinigamePrize({
      ...lockedPrizeSettings,
      prizes: availablePrizes,
    })
    return { result, prizeSettings: lockedPrizeSettings }
  }

  async recordPlay(props: {
    minigameId: string
    contactId: string
    minigame: MinigameModel
  }): Promise<{
    contactState: MinigameContactModel
    result: MinigamePlayResult
  }> {
    const { minigameId, contactId, minigame } = props
    const now = new Date()
    const { playedAtFrom, playedAtTo } = minigame.generalSettings

    if (now < new Date(playedAtFrom) || now > new Date(playedAtTo)) {
      throw new ChatbotXException(
        "This minigame is not currently active",
        "minigameNotActive",
        403,
      )
    }

    return await db.transaction(async (tx) => {
      const state = await this.resolvePlayState({
        minigameId,
        contactId,
        playerSettings: minigame.playerSettings,
        tx,
        forUpdate: true,
      })

      if (state.remaining <= 0) {
        throw new ChatbotXException(
          "No draws remaining for this contact",
          "minigameNoDrawsLeft",
          403,
        )
      }

      const { result, prizeSettings } = await this.drawPrize({
        minigameId,
        tx,
      })

      if (result.type === "prize" && result.prize.quantity !== undefined) {
        const remainingQuantity = result.prize.quantity - 1
        await tx
          .update(minigameModel)
          .set({
            prizeSettings: {
              ...prizeSettings,
              prizes: prizeSettings.prizes.map((prize) =>
                prize.id === result.prize.id
                  ? { ...prize, quantity: remainingQuantity }
                  : prize,
              ),
            },
          })
          .where(eq(minigameModel.id, minigameId))
      }

      const [contactState] = await tx
        .update(minigameContactModel)
        .set({
          remaining: state.remaining - 1,
          played: state.played + 1,
        })
        .where(eq(minigameContactModel.id, state.id))
        .returning()

      await tx.insert(minigamePlayModel).values({
        minigameId,
        contactId,
        isWinning: result.type === "prize",
        prizeId: result.type === "prize" ? result.prize.id : null,
        prizeName: result.type === "prize" ? result.prize.name : null,
      })

      return { contactState, result }
    })
  }

  /**
   * Records a play and dispatches its side effects (player tagging, then the
   * configured win/lose message) as one unit — the gameplay-outcome
   * business logic this centralizes previously lived in the app-layer
   * action, which had to duplicate knowledge of the outcome schema shape.
   * Message dispatch is fire-and-forget (already logs and swallows failures
   * internally in `sendOutcomeMessage`) and intentionally not part of the
   * `recordPlay` transaction — a failed outbound message must never roll
   * back an already-recorded play.
   */
  async recordPlayAndDispatch(props: {
    minigameId: string
    contactId: string
    contactInbox: ContactInboxModel
    minigame: MinigameModel
  }): Promise<{
    contactState: MinigameContactModel
    result: MinigamePlayResult
  }> {
    const { minigameId, contactId, contactInbox, minigame } = props

    const { contactState, result } = await this.recordPlay({
      minigameId,
      contactId,
      minigame,
    })

    await tagService.attachToContact({
      workspaceId: minigame.workspaceId,
      contactId,
      tagIds: minigame.generalSettings.playerTagIds,
    })

    if (
      result.type === "nonWinning" &&
      minigame.prizeSettings.nonWinning.loseMessage.enabled
    ) {
      this.sendLoseMessage({
        workspaceId: minigame.workspaceId,
        contactId,
        contactInbox,
        loseMessage: minigame.prizeSettings.nonWinning.loseMessage,
      })
        // biome-ignore lint/suspicious/noEmptyBlockStatements: fire-and-forget, already logs internally on failure
        .catch(() => {})
    }

    if (result.type === "prize" && result.prize.winMessage?.enabled) {
      this.sendWinMessage({
        workspaceId: minigame.workspaceId,
        contactId,
        contactInbox,
        winMessage: result.prize.winMessage,
      })
        // biome-ignore lint/suspicious/noEmptyBlockStatements: fire-and-forget, already logs internally on failure
        .catch(() => {})
    }

    return { contactState, result }
  }

  /**
   * Lists the players of a minigame (one row per contact) joined with the
   * contact profile. `MinigameContact` has no `workspaceId` column, so the
   * parent minigame is looked up first to enforce workspace scoping.
   */
  async list(input: {
    workspaceId: string
    minigameId: string
    page?: number
    perPage?: number
    name?: string
    sort?: MinigameContactListSort
  }) {
    await minigameService.find({
      workspaceId: input.workspaceId,
      id: input.minigameId,
    })

    const pagination = getPaginationWithDefaults({
      page: input.page,
      perPage: input.perPage ?? 10,
    })
    const whereSQL = and(
      eq(minigameContactModel.minigameId, input.minigameId),
      input.name
        ? ilike(contactModel.fullName, likeContains(input.name))
        : undefined,
    )
    const [rows, totalRows] = await Promise.all([
      db
        .select({
          id: minigameContactModel.id,
          contactId: minigameContactModel.contactId,
          played: minigameContactModel.played,
          remaining: minigameContactModel.remaining,
          openedAt: minigameContactModel.openedAt,
          lastPlayedAt: minigameContactModel.updatedAt,
          contact: {
            id: contactModel.id,
            fullName: contactModel.fullName,
            firstName: contactModel.firstName,
            lastName: contactModel.lastName,
            avatar: contactModel.avatar,
          },
        })
        .from(minigameContactModel)
        .innerJoin(
          contactModel,
          eq(minigameContactModel.contactId, contactModel.id),
        )
        .where(whereSQL)
        .orderBy(getMinigameContactListOrder(input.sort))
        .limit(pagination.limit)
        .offset(pagination.offset),
      db
        .select({ value: count() })
        .from(minigameContactModel)
        .innerJoin(
          contactModel,
          eq(minigameContactModel.contactId, contactModel.id),
        )
        .where(whereSQL)
        .then((countRows) => Number(countRows[0]?.value ?? 0)),
    ])

    return {
      data: rows,
      pageCount: Math.ceil(totalRows / (input.perPage ?? 10)),
    }
  }

  /**
   * Lists one contact's play records (win/lose per draw) for a minigame,
   * newest first. Only plays made after the `MinigamePlay` log shipped are
   * available — older plays exist solely as counters on `MinigameContact`.
   */
  async listPlays(input: {
    workspaceId: string
    minigameId: string
    contactId: string
  }) {
    await minigameService.find({
      workspaceId: input.workspaceId,
      id: input.minigameId,
    })

    return await db
      .select({
        id: minigamePlayModel.id,
        isWinning: minigamePlayModel.isWinning,
        prizeName: minigamePlayModel.prizeName,
        createdAt: minigamePlayModel.createdAt,
      })
      .from(minigamePlayModel)
      .where(
        and(
          eq(minigamePlayModel.minigameId, input.minigameId),
          eq(minigamePlayModel.contactId, input.contactId),
        ),
      )
      .orderBy(desc(minigamePlayModel.createdAt))
      .limit(MAX_PLAY_RECORDS)
  }

  /**
   * Sends the configured lose message (text or flow-trigger) for a
   * non-winning play. Best-effort — logs and swallows failures instead of
   * throwing, since a failed outbound message must never break the in-page
   * result the player already saw.
   */
  async sendLoseMessage(props: {
    workspaceId: string
    contactId: string
    contactInbox: ContactInboxModel
    loseMessage: MinigameLoseMessage
  }): Promise<void> {
    await this.sendOutcomeMessage({
      ...props,
      outcomeMessage: props.loseMessage,
      logContext: "lose",
    })
  }

  async sendWinMessage(props: {
    workspaceId: string
    contactId: string
    contactInbox: ContactInboxModel
    winMessage: MinigamePrizeWinMessage
  }): Promise<void> {
    await this.sendOutcomeMessage({
      ...props,
      outcomeMessage: props.winMessage,
      logContext: "win",
    })
  }

  private async sendOutcomeMessage(props: {
    workspaceId: string
    contactId: string
    contactInbox: ContactInboxModel
    outcomeMessage: MinigameLoseMessage | MinigamePrizeWinMessage
    logContext: "win" | "lose"
  }): Promise<void> {
    const { workspaceId, contactId, contactInbox, outcomeMessage, logContext } =
      props
    if (!outcomeMessage.enabled) {
      return
    }

    try {
      // Resolve the DM conversation for the exact channel the player used
      // (contactInbox comes from ContactInbox.sourceId, matched from the
      // ?userId= on the play link) — not just "any" conversation for the
      // contact, which could be an unrelated comment thread.
      const conversation = await conversationService.findDMByContact({
        workspaceId,
        contactId,
        channel: contactInbox.channel as ChannelType,
      })
      if (!conversation) {
        return
      }

      if (outcomeMessage.mode === "flow") {
        if (!outcomeMessage.flowId) {
          return
        }
        await integrationQueue.add(IntegrationJobAction.sendFlow, {
          type: IntegrationJobAction.sendFlow,
          data: {
            conversationId: conversation.id,
            contactInboxId: contactInbox.id,
            flowId: outcomeMessage.flowId,
          },
        })
        return
      }

      if (!outcomeMessage.text) {
        return
      }

      const repository = await createMessageRepository()
      const createdAt = new Date()
      const message = await repository.create({
        text: outcomeMessage.text,
        messageType: "outgoing",
        workspaceId,
        conversationId: conversation.id,
        senderType: "system",
        senderId: null,
        contactInboxId: contactInbox.id,
        contentType: "text",
        createdAt,
        contentAttributes: null,
      })

      await db
        .update(conversationModel)
        .set({ lastActivityAt: createdAt })
        .where(eq(conversationModel.id, conversation.id))

      await contactInboxService.updateTracking({
        contactInboxId: contactInbox.id,
        contactId: contactInbox.contactId,
        workspaceId,
        data: {
          firstInteractionAt: message.createdAt,
          lastMessageAt: message.createdAt,
        },
      })

      await chatQueue.add(ChatJobAction.sendChannelMessage, {
        type: ChatJobAction.sendChannelMessage,
        data: { conversation, contactInbox, message },
      })
    } catch (error) {
      logger.warn(
        { err: normalizeError(error), workspaceId, contactId },
        `Failed to send minigame ${logContext} message`,
      )
    }
  }
}

export const minigameContactService = new MinigameContactService()
