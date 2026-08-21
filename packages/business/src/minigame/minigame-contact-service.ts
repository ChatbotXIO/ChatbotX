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
  MinigameLoseMessage,
  MinigamePlayerSettings,
} from "@chatbotx.io/database/partials"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import {
  contactModel,
  conversationModel,
  minigameContactModel,
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

    const existing = forUpdate
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

    if (!existing) {
      const [created] = await tx
        .insert(minigameContactModel)
        .values({
          minigameId,
          contactId,
          openedAt: new Date(),
          remaining: playerSettings.drawsPerPerson,
          played: 0,
        })
        .returning()
      return created
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

      const result = resolveMinigamePrize(minigame.prizeSettings)

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
    const { workspaceId, contactId, contactInbox, loseMessage } = props
    if (!loseMessage.enabled) {
      return
    }

    try {
      const conversation = await conversationService.findLatestByContact({
        contactId,
      })
      if (!conversation) {
        return
      }

      if (loseMessage.mode === "flow") {
        if (!loseMessage.flowId) {
          return
        }
        await integrationQueue.add(IntegrationJobAction.sendFlow, {
          type: IntegrationJobAction.sendFlow,
          data: {
            conversationId: conversation.id,
            contactInboxId: contactInbox,
            flowId: loseMessage.flowId,
          },
        })
        return
      }

      if (!loseMessage.text) {
        return
      }

      const repository = await createMessageRepository()
      const createdAt = new Date()
      const message = await repository.create({
        text: loseMessage.text,
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
        "Failed to send minigame lose message",
      )
    }
  }
}

export const minigameContactService = new MinigameContactService()
