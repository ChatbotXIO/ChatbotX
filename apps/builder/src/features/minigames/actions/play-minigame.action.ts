"use server"

import { contactInboxService, tagService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  minigameContactService,
  minigameService,
} from "@chatbotx.io/business/minigame"
import { minigameTypes } from "@chatbotx.io/database/partials"
import { getTranslations } from "next-intl/server"
import { actionClient } from "@/lib/safe-action"
import { playMinigameRequest } from "../schemas/action"

export const playMinigameAction = actionClient
  .inputSchema(playMinigameRequest)
  .action(async ({ parsedInput }) => {
    const { minigameId, userId } = parsedInput
    const t = await getTranslations("minigames.play")

    const minigame = await minigameService.findUnscoped(minigameId)
    if (!minigame?.enabled) {
      throw new ChatbotXException(t("forbiddenDescription"), "notFound", 404)
    }

    if (minigame.type !== minigameTypes.enum.jackpot) {
      throw new ChatbotXException(
        t("comingSoonDescription"),
        "minigameNotPlayable",
        404,
      )
    }

    const contactInbox = await contactInboxService.findLatestBySourceId({
      sourceId: userId,
      workspaceId: minigame.workspaceId,
    })
    if (!contactInbox) {
      throw new ChatbotXException(t("forbiddenDescription"), "notFound", 403)
    }
    const contactId = contactInbox.contactId

    let contactState: Awaited<
      ReturnType<typeof minigameContactService.recordPlay>
    >["contactState"]
    let result: Awaited<
      ReturnType<typeof minigameContactService.recordPlay>
    >["result"]
    try {
      ;({ contactState, result } = await minigameContactService.recordPlay({
        minigameId: minigame.id,
        contactId,
        minigame,
      }))
    } catch (error) {
      if (
        error instanceof ChatbotXException &&
        error.code === "minigameNoDrawsLeft"
      ) {
        throw new ChatbotXException(
          t("noDrawsLeft"),
          "minigameNoDrawsLeft",
          403,
        )
      }
      if (
        error instanceof ChatbotXException &&
        error.code === "minigameNotActive"
      ) {
        throw new ChatbotXException(
          t("notStartedYet"),
          "minigameNotActive",
          403,
        )
      }
      throw error
    }

    await tagService.attachToContact({
      workspaceId: minigame.workspaceId,
      contactId,
      tagIds: minigame.generalSettings.playerTagIds,
    })

    if (
      result.type === "nonWinning" &&
      minigame.prizeSettings.nonWinning.loseMessage.enabled
    ) {
      minigameContactService
        .sendLoseMessage({
          workspaceId: minigame.workspaceId,
          contactId,
          contactInbox,
          loseMessage: minigame.prizeSettings.nonWinning.loseMessage,
        })
        // biome-ignore lint/suspicious/noEmptyBlockStatements: fire-and-forget, already logs internally on failure
        .catch(() => {})
    }

    return { result, remaining: contactState.remaining }
  })
