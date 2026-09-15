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
  type: minigameTypes.describe("Minigame type, e.g. `jackpot`."),
  generalSettings: minigameGeneralSettingsSchema.describe(
    "Name, status, and other top-level configuration.",
  ),
  appearance: minigameAppearanceSchema.describe(
    "Visual theme and branding shown to players.",
  ),
  playerSettings: minigamePlayerSettingsSchema.describe(
    "Rules for who can play and how often.",
  ),
  prizeSettings: minigamePrizeSettingsSchema.describe(
    "Prizes and their odds/quantities.",
  ),
  winningMessageSettings: minigameWinningMessageSettingsSchema.describe(
    "Message shown to a player who wins a prize.",
  ),
  nonWinningMessageSettings: minigameNonWinningMessageSettingsSchema.describe(
    "Message shown to a player who does not win.",
  ),
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
