import {
  postWriterModes,
  postWriterProviders,
  postWriterTones,
} from "@chatbotx.io/ai/post-writer"
import { zodBigintIdAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { MAX_CTA_CHARS } from "./lib/writing-preferences"
import { isAiIntegrationId } from "./model-choice"

/** Most characters of text or brief the model receives. */
const MAX_AI_INPUT_CHARS = 4000
const MAX_KEY_LENGTH = 255
const MAX_DESTINATIONS = 20
const MAX_PROVIDERS = 4
const MAX_VARIANTS = 3
const LANGUAGE_CODE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/

export const generatePostTextFields = z.strictObject({
  callToAction: z
    .boolean()
    .optional()
    .describe(
      "End the post with a call to action. Default false, or true when `callToActionText` is sent.",
    ),
  callToActionText: z
    .string()
    .trim()
    .min(1)
    .max(MAX_CTA_CHARS)
    .optional()
    .describe(
      "Wording of the call to action (up to 80 characters), such as `Book your table today`. Sent to the AI provider as material, never as instructions.",
    ),
  emoji: z
    .boolean()
    .optional()
    .describe("Use a few fitting emoji. Default true."),
  hashtags: z
    .boolean()
    .optional()
    .describe(
      "Add relevant hashtags at the end. Default: true when one of the networks is Instagram or TikTok, else false. Ignored by mode `hashtags`.",
    ),
  perNetwork: z
    .boolean()
    .optional()
    .describe(
      "With two or more `providers` (or `destinationIds` on two networks), return one version per network, each in that network's style, in `variants[].provider`. `variants` is then ignored. Default false.",
    ),
  providers: z
    .array(postWriterProviders)
    .max(MAX_PROVIDERS)
    .optional()
    .describe(
      "The networks the post is for (`facebook`, `instagram`, `threads`, `tiktok`); the text is written in their style. Omit to use the networks of `destinationIds`, or no network style when there are none.",
    ),
  variants: z
    .number()
    .int()
    .min(1)
    .max(MAX_VARIANTS)
    .optional()
    .describe(
      "How many different options to return, 1 to 3 (default 1). One model call either way.",
    ),
  brief: z
    .string()
    .trim()
    .min(1)
    .max(MAX_AI_INPUT_CHARS)
    .optional()
    .describe(
      "What the post is about (mode `write`). Sent to the AI provider, which is the workspace's own AI integration.",
    ),
  destinationIds: z
    .array(zodBigintIdAsString())
    .max(MAX_DESTINATIONS)
    .optional()
    .describe(
      "Destination ids from `publishDestinations.list`. They only supply the character limit (the shortest of their networks) the result is cut to; nothing is loaded or saved. Required for mode `fit`.",
    ),
  idempotencyKey: z
    .string()
    .trim()
    .min(1)
    .max(MAX_KEY_LENGTH)
    .describe(
      "Required. Make a new random one per click or call. The same key with the same request returns the first result (or its failure) for 10 minutes without a second paid model call; the same key with another request answers 422 `aiKeyReused`, and while the first call still runs, 409 `aiRequestInProgress`.",
    ),
  integrationId: z
    .string()
    .trim()
    .min(1)
    .max(MAX_KEY_LENGTH)
    .optional()
    .describe(
      "The AI integration to write with: a connected provider name (`openai`, `gemini`, `claude`, `deepseek`, `openrouter`, `muse`) or the id of an OpenAI-compatible integration (a connected provider shows in `integrations.getAiProvider`). Send it together with `model`, or neither: without both, the model chosen for Inbox translation (`translation.getSettings`) is used, and 409 `aiModelNotChosen` answers when there is none.",
    ),
  language: z
    .string()
    .regex(LANGUAGE_CODE, "A language code such as `en`, `vi` or `pt-BR`.")
    .optional()
    .describe(
      "Language to write in, such as `en` or `vi`. Omit to keep the language of the text or brief.",
    ),
  model: z
    .string()
    .trim()
    .min(1)
    .max(MAX_KEY_LENGTH)
    .optional()
    .describe(
      "The model id of `integrationId`, such as `gpt-5.4-mini`. Required with `integrationId`.",
    ),
  mode: postWriterModes.describe(
    "`write` a new post from `brief`; `rewrite`, `shorten`, `expand` or `tone` (needs `tone`) the given `text`; `fit` the `text` to the limit of `destinationIds`; `hashtags` returns only a list of hashtags for the `text` (in `hashtags`, not `variants`).",
  ),
  text: z
    .string()
    .trim()
    .min(1)
    .max(MAX_AI_INPUT_CHARS)
    .optional()
    .describe(
      "The text to edit (every mode but `write`). Sent to the AI provider.",
    ),
  tone: postWriterTones
    .optional()
    .describe("The tone to write in; required for mode `tone`."),
})

/** Each mode needs its own input; shared by the public and the session request. */
export const checkGeneratePostTextRequest = (
  request: z.output<typeof generatePostTextFields>,
  context: z.RefinementCtx,
): void => {
  const missing = (path: string, message: string) =>
    context.addIssue({ code: "custom", message, path: [path] })
  if (Boolean(request.integrationId) !== Boolean(request.model)) {
    missing(
      request.integrationId ? "model" : "integrationId",
      "Send `integrationId` and `model` together, or neither.",
    )
  }
  if (request.integrationId && !isAiIntegrationId(request.integrationId)) {
    missing(
      "integrationId",
      "Use a connected provider name or an OpenAI-compatible integration id.",
    )
  }
  if (request.mode === "write" && !request.brief) {
    missing("brief", "Mode `write` needs a brief.")
  }
  if (request.mode !== "write" && !request.text) {
    missing("text", `Mode \`${request.mode}\` needs the text to edit.`)
  }
  if (request.mode === "tone" && !request.tone) {
    missing("tone", "Mode `tone` needs a tone.")
  }
  if (request.mode === "fit" && !request.destinationIds?.length) {
    missing("destinationIds", "Mode `fit` needs at least one destination.")
  }
}

export const generatePostTextRequest = generatePostTextFields.superRefine(
  checkGeneratePostTextRequest,
)

export const generatePostTextResource = z.object({
  hashtags: z
    .array(z.string())
    .describe(
      "Mode `hashtags` only: the suggested tags, each starting with `#`. Empty otherwise.",
    ),
  limit: z
    .number()
    .nullable()
    .describe(
      "The shortest character limit that applied, or null when no network documents one.",
    ),
  text: z
    .string()
    .describe(
      "The first suggestion, plain text (the same as `variants[0].text`). Nothing was saved or published.",
    ),
  truncated: z
    .boolean()
    .describe("True when the model's answer was cut to fit a limit."),
  usage: z.object({
    inputChars: z.number(),
    outputChars: z.number(),
  }),
  variants: z
    .array(
      z.object({
        limit: z
          .number()
          .nullable()
          .describe("The limit this text was cut to, or null."),
        provider: postWriterProviders
          .nullable()
          .describe("The network of a per-network version, else null."),
        text: z.string(),
        truncated: z.boolean(),
      }),
    )
    .describe(
      "The suggestions: 1 to 3 options, or one per network with `perNetwork`. Empty in mode `hashtags`.",
    ),
})
