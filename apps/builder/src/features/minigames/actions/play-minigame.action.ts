"use server"

import { contactInboxService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  minigameContactService,
  minigameService,
} from "@chatbotx.io/business/minigame"
import { verifyMinigamePlayToken } from "@chatbotx.io/encryption/minigame-play-token"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import {
  checkGuestRateLimit,
  resolveGuestRateLimitKey,
} from "@/lib/rate-limit/guest-rate-limit"
import { actionClient } from "@/lib/safe-action"
import { MINIGAME_PLAY_SCREENS } from "../components/play/minigame-play-screen-registry"
import { playMinigameRequest } from "../schema/action"

export const playMinigameAction = actionClient
  .inputSchema(playMinigameRequest)
  .action(async ({ parsedInput }) => {
    const { minigameId, token } = parsedInput
    const t = await getTranslations("minigames.play")

    const minigame = await minigameService.findUnscoped(minigameId)
    if (!minigame?.enabled) {
      throw new ChatbotXException(t("forbiddenDescription"), "notFound", 404)
    }

    if (!Object.hasOwn(MINIGAME_PLAY_SCREENS, minigame.type)) {
      throw new ChatbotXException(
        t("comingSoonDescription"),
        "minigameNotPlayable",
        404,
      )
    }

    // The play link carries a signed, expiring token (not a raw contact id)
    // so a contact can only play as themselves — see `signMinigamePlayToken`.
    const payload = await verifyMinigamePlayToken(token).catch(() => null)
    if (!payload || payload.workspaceId !== minigame.workspaceId) {
      throw new ChatbotXException(t("forbiddenDescription"), "notFound", 403)
    }

    const contactInbox = await contactInboxService.findBy({
      where: { id: payload.contactInboxId },
    })
    if (!contactInbox) {
      throw new ChatbotXException(t("forbiddenDescription"), "notFound", 403)
    }
    const contactId = contactInbox.contactId

    // The per-contact `remaining` counter used to be the only throttle on this
    // unauthenticated endpoint; referral bonuses make it worth abusing, so
    // meter it by IP too. `webchatId` is just the key namespace despite its
    // name — prefixing keeps minigame buckets off webchat's.
    //
    // With no header-setting proxy in front, every player would otherwise
    // share the one `UNKNOWN_CLIENT_IP` bucket and a popular minigame would
    // 429 everyone. The play token's `contactInboxId` is a per-player
    // identity that is already verified above, so it is a safe substitute.
    const rateLimit = await checkGuestRateLimit({
      webchatId: `minigame:${minigame.id}`,
      clientIp: resolveGuestRateLimitKey(
        await headers(),
        `contact-inbox:${payload.contactInboxId}`,
      ),
    })
    if (rateLimit.limited) {
      throw new ChatbotXException(t("rateLimited"), "rateLimited", 429)
    }

    let contactState: Awaited<
      ReturnType<typeof minigameContactService.recordPlayAndDispatch>
    >["contactState"]
    let result: Awaited<
      ReturnType<typeof minigameContactService.recordPlayAndDispatch>
    >["result"]
    try {
      ;({ contactState, result } =
        await minigameContactService.recordPlayAndDispatch({
          minigameId: minigame.id,
          contactId,
          contactInbox,
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

    return { result, remaining: contactState.remaining }
  })
