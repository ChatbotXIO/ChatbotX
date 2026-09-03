import {
  minigameAppearanceSchema,
  minigameGeneralSettingsSchema,
  minigameNonWinningMessageSettingsSchema,
  minigamePlayerSettingsSchema,
  minigamePrizeSettingsSchema,
  minigameTypes,
  minigameWinningMessageSettingsSchema,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const createMinigameRequest = z.object({
  type: minigameTypes,
  generalSettings: minigameGeneralSettingsSchema,
  appearance: minigameAppearanceSchema,
  playerSettings: minigamePlayerSettingsSchema,
  prizeSettings: minigamePrizeSettingsSchema,
  winningMessageSettings: minigameWinningMessageSettingsSchema,
  nonWinningMessageSettings: minigameNonWinningMessageSettingsSchema,
})
export type CreateMinigameRequest = z.infer<typeof createMinigameRequest>

export const updateMinigameRequest = createMinigameRequest
export type UpdateMinigameRequest = z.infer<typeof updateMinigameRequest>

export const playMinigameRequest = z.object({
  minigameId: zodBigintAsString(),
  token: z.string(),
})
export type PlayMinigameRequest = z.infer<typeof playMinigameRequest>

export const getMinigamePlaysRequest = z.object({
  minigameId: zodBigintAsString(),
  contactId: zodBigintAsString(),
})
export type GetMinigamePlaysRequest = z.infer<typeof getMinigamePlaysRequest>

export const findContactConversationRequest = z.object({
  contactId: zodBigintAsString(),
  contactInboxId: zodBigintAsString().nullable(),
})
export type FindContactConversationRequest = z.infer<
  typeof findContactConversationRequest
>
