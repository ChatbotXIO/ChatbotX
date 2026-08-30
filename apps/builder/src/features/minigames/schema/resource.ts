import {
  minigameAppearanceSchema,
  minigameGeneralSettingsSchema,
  minigameNonWinningMessageSettingsSchema,
  minigamePlayerSettingsSchema,
  minigamePrizeSettingsSchema,
  minigameWinningMessageSettingsSchema,
} from "@chatbotx.io/database/partials"
import { createSelectSchema, minigameModel } from "@chatbotx.io/database/schema"
import { z } from "zod"

export const minigameResource = createSelectSchema(minigameModel, {
  id: z.string(),
  workspaceId: z.string(),
  generalSettings: minigameGeneralSettingsSchema,
  appearance: minigameAppearanceSchema,
  playerSettings: minigamePlayerSettingsSchema,
  prizeSettings: minigamePrizeSettingsSchema,
  winningMessageSettings: minigameWinningMessageSettingsSchema,
  nonWinningMessageSettings: minigameNonWinningMessageSettingsSchema,
})
export type MinigameResource = z.infer<typeof minigameResource>
