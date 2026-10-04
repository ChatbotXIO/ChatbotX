import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { uploadModes } from "./shared"

export const minigameImageSchema = z.object({
  mode: uploadModes
    .default("file")
    .describe(
      'How the image is supplied: "url" for an externally hosted image, "file" for an uploaded file. Defaults to "file".',
    ),
  url: z
    .string()
    .default("")
    .describe(
      'Public URL of the image (the uploaded file\'s URL when mode is "file"). Empty string means no image. Defaults to empty.',
    ),
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
    name: z
      .string()
      .trim()
      .min(1)
      .max(150)
      .describe("Minigame name, 1-150 characters."),
    showName: z
      .boolean()
      .default(false)
      .describe(
        "Whether the name is displayed on the play screen. Defaults to false.",
      ),
    playedAtFrom: z.iso
      .datetime()
      .describe(
        "Start of the play window, ISO 8601 datetime (e.g. 2026-01-01T00:00:00.000Z). Plays outside the window are rejected.",
      ),
    playedAtTo: z.iso
      .datetime()
      .describe(
        "End of the play window, ISO 8601 datetime. Must be on or after playedAtFrom.",
      ),
    rulesDescription: z
      .string()
      .max(5000)
      .default("")
      .describe(
        "Rules or terms text shown to players on the play screen, up to 5000 characters. Defaults to empty.",
      ),
    openerTagIds: z
      .array(zodBigintAsString())
      .default([])
      .describe(
        "Tag ids attached to a contact when they open the play link. Get ids from `tags.list`. Defaults to none.",
      ),
    playerTagIds: z
      .array(zodBigintAsString())
      .default([])
      .describe(
        "Tag ids attached to a contact each time they complete a play (win or lose). Get ids from `tags.list`. Defaults to none.",
      ),
    newFriendTagIds: z
      .array(zodBigintAsString())
      .default([])
      .describe(
        "Tag ids attached to a new contact who arrives through another player's share link (referral). Get ids from `tags.list`. Defaults to none.",
      ),
  })
  .refine((data) => data.playedAtTo >= data.playedAtFrom, {
    message: "playedAtTo must be on or after playedAtFrom",
    path: ["playedAtTo"],
  })
export type MinigameGeneralSettings = z.infer<
  typeof minigameGeneralSettingsSchema
>

export const minigameAppearanceSchema = z.object({
  backgroundColor: z
    .string()
    .max(50)
    .default("#F5A623")
    .describe(
      "Page background color as a CSS color string (e.g. #F5A623), up to 50 characters. Defaults to #F5A623.",
    ),
  machineColor: z
    .string()
    .max(50)
    .default("#4A90D9")
    .describe(
      "Color of the game machine/main graphic as a CSS color string (e.g. #4A90D9), up to 50 characters. Defaults to #4A90D9.",
    ),
  decorativeColor: z
    .string()
    .max(50)
    .default("#FFFFFF")
    .describe(
      "Accent color for decorative elements as a CSS color string (e.g. #FFFFFF), up to 50 characters. Defaults to #FFFFFF.",
    ),
  ruleTextColor: z
    .string()
    .max(50)
    .default("#000000")
    .describe(
      "Color of the rules text as a CSS color string (e.g. #000000), up to 50 characters. Defaults to #000000.",
    ),
  backgroundImage: minigameImageSchema.describe(
    "Background image of the play screen.",
  ),
  prizeDescriptionImage: minigameImageSchema.describe(
    "Image illustrating the prizes, shown on the play screen.",
  ),
  startButtonImage: minigameImageSchema.describe(
    "Custom image for the start/play button.",
  ),
})
export type MinigameAppearance = z.infer<typeof minigameAppearanceSchema>

/**
 * Shared across both reset policies. Extended (not intersected) into each
 * branch because `z.discriminatedUnion` requires every option to be a
 * `ZodObject`, and `.and()` produces a `ZodIntersection`.
 */
const minigamePlayerSettingsBase = z.object({
  drawsPerPerson: z
    .number()
    .int()
    .min(1)
    .default(1)
    .describe(
      "Number of plays each contact gets (per reset cycle when resetPolicy is everyNDays). Minimum 1, defaults to 1.",
    ),
  /**
   * Cap on bonus draws one player can earn by referring friends to this
   * minigame (see `MinigameContact.sharesCount`). `0` disables referral
   * bonuses. Lifetime, not per reset cycle: under `everyNDays` the cap keeps
   * counting across cycles while unused bonus draws expire with the cycle.
   *
   * `playerSettings` is stored as unvalidated jsonb and is never parsed on
   * read, so rows written before this field existed have no key at all —
   * every consumer must read it as `maxSharesPerPerson ?? 0`, which also
   * keeps referral bonuses off for minigames created before the feature.
   */
  maxSharesPerPerson: z
    .number()
    .int()
    .min(0)
    .max(100)
    .default(0)
    .describe(
      "Max bonus plays one contact can earn by referring friends via their share link (lifetime cap, 0-100). 0 disables referral bonuses. Defaults to 0.",
    ),
  /**
   * The flow step run for a friend who arrives through a player's share link
   * (the `minigame-share` `RefConfig` variant, handled in
   * `apps/worker/src/integration/handlers/ref.ts`). `sharingNodeId === null`
   * is the ONLY switch that hides the play screen's Share button.
   *
   * Resolved at click time rather than baked into the link, so changing the
   * node here repairs every already-shared link instead of stranding them.
   *
   * Same unvalidated-jsonb caveat as `maxSharesPerPerson`: rows written
   * before these fields existed have no key at all, so every server-side
   * consumer must read them as `?? null` — the `$type<MinigamePlayerSettings>()`
   * on the column will claim `string | null` for a value that is `undefined`.
   */
  sharingFlowId: zodBigintAsString()
    .nullable()
    .default(null)
    .describe(
      "Flow containing the sharing node. Get it from `flows.list`. Null when sharing is off. Defaults to null.",
    ),
  sharingNodeId: zodBigintAsString()
    .nullable()
    .default(null)
    .describe(
      "Flow node run for a friend who arrives through a player's share link. Setting it turns the Share button on; null hides it. Defaults to null.",
    ),
})

export const minigamePlayerSettingsSchema = z.discriminatedUnion(
  "resetPolicy",
  [
    minigamePlayerSettingsBase.extend({
      resetPolicy: z
        .literal("never")
        .describe(
          "Plays are never reset: drawsPerPerson is a lifetime allowance.",
        ),
    }),
    minigamePlayerSettingsBase.extend({
      resetPolicy: z
        .literal("everyNDays")
        .describe(
          "Each contact's remaining plays reset to drawsPerPerson every resetIntervalDays days.",
        ),
      resetIntervalDays: z
        .number()
        .int()
        .min(1)
        .default(1)
        .describe(
          "Days between play-allowance resets (minimum 1). Defaults to 1.",
        ),
    }),
  ],
)
export type MinigamePlayerSettings = z.infer<
  typeof minigamePlayerSettingsSchema
>

const OUTCOME_ENABLED =
  "Whether this follow-up message is sent to the player after the draw. Defaults to false."

export const minigameOutcomeMessageSchema = z.discriminatedUnion("mode", [
  z.object({
    enabled: z.boolean().default(false).describe(OUTCOME_ENABLED),
    mode: z
      .literal("text")
      .describe("Send a plain text message to the player's DM conversation."),
    text: z
      .string()
      .max(1000)
      .default("")
      .describe(
        "Message text, up to 1000 characters. May use {{prize_name}} for the drawn prize's name and spintax. Defaults to empty.",
      ),
  }),
  z.object({
    enabled: z.boolean().default(false).describe(OUTCOME_ENABLED),
    mode: z
      .literal("flow")
      .describe("Run a whole flow in the player's DM conversation."),
    flowId: zodBigintAsString()
      .nullable()
      .default(null)
      .describe("Flow to run. Get it from `flows.list`. Null sends nothing."),
  }),
  z.object({
    enabled: z.boolean().default(false).describe(OUTCOME_ENABLED),
    mode: z
      .literal("node")
      .describe("Run a single node of a flow in the player's DM conversation."),
    flowId: zodBigintAsString()
      .nullable()
      .default(null)
      .describe(
        "Flow that contains the node. Get it from `flows.list`. Null sends nothing.",
      ),
    nodeId: zodBigintAsString()
      .nullable()
      .default(null)
      .describe("Node within flowId to start from. Defaults to null."),
  }),
])
export type MinigameOutcomeMessage = z.infer<
  typeof minigameOutcomeMessageSchema
>

export const minigamePrizeItemSchema = z.object({
  id: z
    .string()
    .describe(
      "Client-chosen unique id for this prize within the minigame (any string). Keep it stable across updates so stock tracking stays attached.",
    ),
  name: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .describe("Prize name shown to the player, 1-100 characters."),
  icon: minigameImageSchema.describe("Image representing the prize."),
  winRate: z
    .number()
    .min(0)
    .max(100)
    .describe(
      "Probability of winning this prize as a percentage (0-100). All prizes' winRate plus nonWinning.loseRate must total exactly 100.",
    ),
  /**
   * Remaining stock for this prize; decremented by 1 each time it's won.
   * Omitted means unlimited (no stock is tracked or decremented).
   */
  quantity: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      "Remaining stock, decremented by 1 per win; at 0 the prize can no longer be won. Omit for unlimited.",
    ),
})
export type MinigamePrizeItem = z.infer<typeof minigamePrizeItemSchema>

export const minigameNonWinningSettingSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(150)
    .describe(
      "Label for the no-prize outcome (1-150 characters); also used as the prize name for {{prize_name}} and prizeNameCustomFieldId on a loss.",
    ),
  loseRate: z
    .number()
    .min(0)
    .max(100)
    .describe(
      "Probability of not winning, as a percentage (0-100). Together with all prizes' winRate it must total exactly 100.",
    ),
  loseImage: minigameImageSchema.describe(
    "Image shown to the player when they do not win.",
  ),
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
    prizes: z
      .array(minigamePrizeItemSchema)
      .default([])
      .describe("Prizes that can be won. Defaults to none."),
    nonWinning: minigameNonWinningSettingSchema.describe(
      "Settings for the no-prize outcome; its loseRate makes the total probability 100%.",
    ),
    prizeNameCustomFieldId: zodBigintAsString()
      .nullable()
      .default(null)
      .describe(
        "Contact custom field id that receives the drawn prize name (or nonWinning.title on a loss) after each play. Get it from `customFields.list`. Null disables it. Defaults to null.",
      ),
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

const DEFAULT_MINIGAME_OUTCOME_MESSAGE: z.infer<
  typeof minigameOutcomeMessageSchema
> = { enabled: false, mode: "text", text: "" }

/**
 * Minigame-local placeholder for the drawn prize's name, usable in the result
 * dialog's `title`/`description` and in `outcomeMessage.text`.
 *
 * It lives here rather than beside either renderer because the two cannot
 * import each other: the dialog is a client component and the outcome-message
 * renderer sits in `@chatbotx.io/business`, which would drag the whole package
 * into the browser bundle. This schema module is the one place both already
 * depend on.
 */
export const MINIGAME_PRIZE_NAME_TOKEN = "{{prize_name}}"

export const minigameWinningMessageSettingsSchema = z.object({
  title: z
    .string()
    .max(150)
    .default("")
    .describe(
      "Heading of the result dialog for a win, up to 150 characters. May use {{prize_name}}. Defaults to empty.",
    ),
  description: z
    .string()
    .max(1000)
    .default("")
    .describe(
      "Body text of the win result dialog, up to 1000 characters. May use {{prize_name}}. Defaults to empty.",
    ),
  acceptButtonText: z
    .string()
    .max(50)
    .default("")
    .describe(
      "Label of the button that dismisses the win dialog, up to 50 characters. Defaults to empty.",
    ),
  shareButtonText: z
    .string()
    .max(50)
    .default("")
    .describe(
      "Label of the Share button in the win dialog, up to 50 characters. Defaults to empty.",
    ),
  shareButtonDescription: z
    .string()
    .max(300)
    .default("")
    .describe(
      "Helper text beside the Share button in the win dialog, up to 300 characters. Defaults to empty.",
    ),
  outcomeMessage: minigameOutcomeMessageSchema
    .default(DEFAULT_MINIGAME_OUTCOME_MESSAGE)
    .describe(
      "Optional follow-up message sent to the winner's DM conversation (text, flow or flow node).",
    ),
})
export type MinigameWinningMessageSettings = z.infer<
  typeof minigameWinningMessageSettingsSchema
>

export const minigameNonWinningMessageSettingsSchema = z.object({
  title: z
    .string()
    .max(150)
    .default("")
    .describe(
      "Heading of the result dialog when the player does not win, up to 150 characters. Defaults to empty.",
    ),
  description: z
    .string()
    .max(1000)
    .default("")
    .describe(
      "Body text of the non-win result dialog, up to 1000 characters. Defaults to empty.",
    ),
  shareButtonText: z
    .string()
    .max(50)
    .default("")
    .describe(
      "Label of the Share button in the non-win dialog, up to 50 characters. Defaults to empty.",
    ),
  shareButtonDescription: z
    .string()
    .max(300)
    .default("")
    .describe(
      "Helper text beside the Share button in the non-win dialog, up to 300 characters. Defaults to empty.",
    ),
  outcomeMessage: minigameOutcomeMessageSchema
    .default(DEFAULT_MINIGAME_OUTCOME_MESSAGE)
    .describe(
      "Optional follow-up message sent to the player's DM conversation after a loss (text, flow or flow node).",
    ),
})
export type MinigameNonWinningMessageSettings = z.infer<
  typeof minigameNonWinningMessageSettingsSchema
>
