"use server"

import { contactInboxService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  minigameContactService,
  minigameService,
} from "@chatbotx.io/business/minigame"
import { verifyMinigamePlayToken } from "@chatbotx.io/encryption/minigame-play-token"
import { cookies, headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import {
  checkGuestRateLimit,
  getGuestClientIp,
} from "@/lib/rate-limit/guest-rate-limit"
import { actionClient } from "@/lib/safe-action"
import { MINIGAME_PLAY_SCREENS } from "../components/play/minigame-play-screen-registry"
import {
  minigameReferralCookieName,
  readMinigameReferrerContactId,
} from "../lib/referral-cookie"
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
    const rateLimit = await checkGuestRateLimit({
      webchatId: `minigame:${minigame.id}`,
      clientIp: getGuestClientIp(await headers()),
    })
    if (rateLimit.limited) {
      throw new ChatbotXException(t("forbiddenDescription"), "rateLimited", 429)
    }

    // Covers the case where a client calls the action before the page render
    // has created this contact's play-state row; `resolvePlayState` still
    // only stamps it on insert.
    const referrerContactId = await readMinigameReferrerContactId({
      minigameId: minigame.id,
      workspaceId: minigame.workspaceId,
    })

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
          referrerContactId: referrerContactId ?? undefined,
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

    // The invite has done its job once this contact has played — clearing it
    // is hygiene only, since the grant is already one-per-invitee-for-life.
    if (referrerContactId) {
      ;(await cookies()).delete(minigameReferralCookieName(minigame.id))
    }

    return { result, remaining: contactState.remaining }
  })
