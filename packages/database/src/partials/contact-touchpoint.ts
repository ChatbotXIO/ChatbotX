import { z } from "zod"

/**
 * The ways a contact opted in or took part, as one derived feed (no table).
 * Neutral names: the provider or channel rides in the row, so a future lead
 * form or comment source adds a kind here and one branch in the repository.
 * Appointments, coupons and ads are not kinds: each has its own panel section.
 */
export const contactTouchpointKinds = z.enum([
  "inboxSource",
  "postComment",
  "minigame",
  "leaderboard",
  "questionnaire",
  "miniApp",
  "poll",
  "leadForm",
  "inboundWebhook",
  "commentAutomation",
  "refLink",
  "magicLink",
  "form",
])
export type ContactTouchpointKind = z.infer<typeof contactTouchpointKinds>

/**
 * What each kind says about the contact's part in it. The repository builds
 * these as JSON; the service parses every row against its kind's schema, so a
 * branch that drifts from its contract fails loudly instead of leaking a shape.
 */
export const contactTouchpointDetailsSchemas = {
  inboxSource: z.object({
    source: z
      .string()
      .describe("How the conversation started, e.g. `direct` or `comment`."),
  }),
  postComment: z.object({
    permalink: z.string().nullable(),
    thumbnail: z.string().nullable(),
  }),
  minigame: z.object({
    played: z.number().int().describe("Plays the contact used on this game."),
    lastPrizeName: z.string().nullable(),
    lastWon: z.boolean().nullable(),
  }),
  leaderboard: z.object({ score: z.number().int() }),
  questionnaire: z.object({
    status: z.enum(["inProgress", "completed"]),
    submissions: z
      .number()
      .int()
      .describe(
        "Completed and in-progress attempts (cancelled, failed and timed-out ones excluded).",
      ),
  }),
  miniApp: z.object({ submissions: z.number().int() }),
  poll: z.object({ candidateName: z.string().nullable() }),
  leadForm: z.object({
    formName: z.string().nullable(),
    leads: z.number().int(),
  }),
  inboundWebhook: z.object({
    requests: z
      .number()
      .int()
      .describe(
        "Requests that saved the contact (processed, or completed with errors) still in the 30-day request log.",
      ),
  }),
  commentAutomation: z.object({
    automationType: z.enum([
      "messenger",
      "instagram",
      "instagramFacebook",
      "threads",
      "tiktok",
    ]),
    replies: z.number().int(),
  }),
  refLink: z.object({
    linkType: z.enum(["refLink", "qrCode"]),
    visits: z.number().int(),
  }),
  magicLink: z.object({ clicks: z.number().int() }),
  form: z.object({}),
} satisfies Record<ContactTouchpointKind, z.ZodType>
