import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { uploadModes } from "./shared"

export const minigameImageSchema = z.object({
  mode: uploadModes.default("file"),
  url: z.string().default(""),
})
export type MinigameImage = z.infer<typeof minigameImageSchema>

export const minigameTypes = z.enum([
  "luckyWheel",
  "jackpot",
  "gashapon",
  "drawLots",
  "scratchOff",
])
export type MinigameType = z.infer<typeof minigameTypes>

/**
 * All six settings groups below are stored as free-form jsonb (no DB-level
 * shape constraint); each schema is the single source of truth for
 * validating its column at the service boundary and for the builder edit
 * form — mirrors `appointmentScheduleWindowConfigSchema`.
 */
export const minigameGeneralSettingsSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    playedAtFrom: z.iso.datetime(),
    playedAtTo: z.iso.datetime(),
    rulesDescription: z.string().max(5000).default(""),
    openerTagIds: z.array(zodBigintAsString()).default([]),
    playerTagIds: z.array(zodBigintAsString()).default([]),
    newFriendTagIds: z.array(zodBigintAsString()).default([]),
    shareEnabled: z.boolean().default(true),
    shareMessage: z.string().max(1000).default("{{shareUrl}}"),
  })
  .refine((data) => data.playedAtTo >= data.playedAtFrom, {
    message: "playedAtTo must be on or after playedAtFrom",
    path: ["playedAtTo"],
  })
export type MinigameGeneralSettings = z.infer<
  typeof minigameGeneralSettingsSchema
>

export const minigameAppearanceSchema = z.object({
  backgroundColor: z.string().max(50).default("#F5A623"),
  machineColor: z.string().max(50).default("#4A90D9"),
  decorativeColor: z.string().max(50).default("#FFFFFF"),
  ruleTextColor: z.string().max(50).default("#000000"),
  backgroundImage: minigameImageSchema,
  prizeDescriptionImage: minigameImageSchema,
  startButtonImage: minigameImageSchema,
})
export type MinigameAppearance = z.infer<typeof minigameAppearanceSchema>

export const minigamePlayerSettingsSchema = z.discriminatedUnion(
  "resetPolicy",
  [
    z.object({
      drawsPerPerson: z.number().int().min(1).default(1),
      resetPolicy: z.literal("never"),
    }),
    z.object({
      drawsPerPerson: z.number().int().min(1).default(1),
      resetPolicy: z.literal("everyNDays"),
      resetIntervalDays: z.number().int().min(1).default(1),
    }),
  ],
)
export type MinigamePlayerSettings = z.infer<
  typeof minigamePlayerSettingsSchema
>

export const minigamePrizeWinMessageSchema = z.discriminatedUnion("mode", [
  z.object({
    enabled: z.boolean().default(false),
    mode: z.literal("text"),
    text: z.string().max(1000).default(""),
  }),
  z.object({
    enabled: z.boolean().default(false),
    mode: z.literal("flow"),
    flowId: zodBigintAsString().nullable().default(null),
  }),
])
export type MinigamePrizeWinMessage = z.infer<
  typeof minigamePrizeWinMessageSchema
>

export const minigamePrizeItemSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(100),
  icon: minigameImageSchema,
  winRate: z.number().min(0).max(100),
  /**
   * Remaining stock for this prize; decremented by 1 each time it's won.
   * Omitted means unlimited (no stock is tracked or decremented).
   */
  quantity: z.number().int().min(0).optional(),
  winMessage: minigamePrizeWinMessageSchema,
})
export type MinigamePrizeItem = z.infer<typeof minigamePrizeItemSchema>

export const minigameLoseMessageSchema = z.discriminatedUnion("mode", [
  z.object({
    enabled: z.boolean().default(false),
    mode: z.literal("text"),
    text: z.string().max(1000).default(""),
  }),
  z.object({
    enabled: z.boolean().default(false),
    mode: z.literal("flow"),
    flowId: zodBigintAsString().nullable().default(null),
  }),
])
export type MinigameLoseMessage = z.infer<typeof minigameLoseMessageSchema>

export const minigameNonWinningSettingSchema = z.object({
  title: z.string().trim().min(1).max(150),
  loseRate: z.number().min(0).max(100),
  loseImage: minigameImageSchema,
  loseMessage: minigameLoseMessageSchema,
})
export type MinigameNonWinningSetting = z.infer<
  typeof minigameNonWinningSettingSchema
>

/**
 * Whether a set of prize win-rates plus the non-winning lose-rate sum to
 * exactly 100%, tolerant of float drift via integer-cents rounding. Shared
 * between this schema's `.refine()` and the builder's prize-list editor so
 * the tolerance rule can't drift between client and server.
 */
export function isMinigameProbabilityTotalValid(total: number): boolean {
  return Math.round(total * 100) === 10_000
}

export const minigamePrizeSettingsSchema = z
  .object({
    prizes: z.array(minigamePrizeItemSchema).default([]),
    nonWinning: minigameNonWinningSettingSchema,
  })
  .refine(
    (data) => {
      const total =
        data.prizes.reduce((sum, prize) => sum + prize.winRate, 0) +
        data.nonWinning.loseRate
      return isMinigameProbabilityTotalValid(total)
    },
    {
      message: "Total probability of all prizes must equal 100%",
      path: ["nonWinning", "loseRate"],
    },
  )
export type MinigamePrizeSettings = z.infer<typeof minigamePrizeSettingsSchema>

export const minigameWinningMessageSettingsSchema = z.object({
  title: z.string().max(150).default(""),
  description: z.string().max(1000).default(""),
  acceptButtonText: z.string().max(50).default(""),
  shareButtonText: z.string().max(50).default(""),
  shareButtonDescription: z.string().max(300).default(""),
})
export type MinigameWinningMessageSettings = z.infer<
  typeof minigameWinningMessageSettingsSchema
>

export const minigameNonWinningMessageSettingsSchema = z.object({
  title: z.string().max(150).default(""),
  description: z.string().max(1000).default(""),
  shareButtonText: z.string().max(50).default(""),
  shareButtonDescription: z.string().max(300).default(""),
})
export type MinigameNonWinningMessageSettings = z.infer<
  typeof minigameNonWinningMessageSettingsSchema
>
