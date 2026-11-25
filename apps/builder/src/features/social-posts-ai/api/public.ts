import { possibleErrorsOnGeneratingPostText } from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { generatePostText } from "../lib/generate-post-text"
import { generatePostTextRequest, generatePostTextResource } from "../schema"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("posts")

export const socialPostsAiPublicRouter = {
  generate: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/posts/ai/generate",
      summary: "Write post text with AI",
      description:
        'Returns suggested post text; nothing is saved or published (put the text into `socialPosts.create` yourself). `mode`: `write` a new post from a `brief`; `rewrite`, `shorten`, `expand`, or `tone` (give `tone`) the given `text`; `fit` the `text` to the character limit of `destinationIds` (the shortest limit of their networks; any mode with `destinationIds` cuts the result to it and says so in `truncated`). The text and brief are sent to the AI provider you pick with `integrationId` + `model` (both or neither; a connected provider name or an OpenAI-compatible integration id), paid with the workspace\'s own key. Without them the model chosen for Inbox translation (`translation.getSettings`) is used; with neither, 409 `aiModelNotChosen`; an integration that is missing, disabled or not this workspace\'s answers 409 `aiNeedsReconfiguration`. `idempotencyKey` is required: the same key and request returns the first result or failure for 10 minutes with no second model call. Limits: 30 calls per minute and 500 per day per workspace (429 `aiRateLimited`), one at a time per caller (409 `aiRequestInProgress`). Not allowed in a workspace whose plan has expired (402). Network style: `providers` (or the networks of `destinationIds`) selects a fixed style guide per network (Facebook, Instagram, Threads, TikTok); with `perNetwork: true` and two or more networks you get one version per network in `variants[].provider`. Options: `hashtags`, `emoji`, `callToAction` (+ `callToActionText`, up to 80 characters); defaults are hashtags on for Instagram/TikTok only, emoji on, call to action off. `variants` (1 to 3) returns that many different options from one call. Mode `hashtags` returns only `hashtags` for the given `text`. The response has `variants` (each `{text, provider, limit, truncated}`), `hashtags`, and `text` = the first variant. Makes one paid model call whatever the number of variants. Example: `{"mode":"write","brief":"Announce our weekend sale, 20% off","idempotencyKey":"sale-draft-1","destinationIds":["123"],"hashtags":true,"variants":2}`.',
      tags: ["Posts"],
    })
    .input(generatePostTextRequest)
    .output(generatePostTextResource)
    .errors(possibleErrorsOnGeneratingPostText)
    .handler(
      async ({ context, input }) =>
        await generatePostText({
          // One in-flight guard per credential, not one for every API caller.
          actorId: context.apiToken.id,
          request: input,
          workspace: context.workspace,
        }),
    ),
}
