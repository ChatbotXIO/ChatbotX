import { commentAutomationService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { processMissedComments } from "../lib/missed-comments/process-missed-comments"
import { MISSED_COMMENTS_SCAN_DAYS } from "../lib/missed-comments/types"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

const automationIdSchema = zodBigintAsString().describe(
  "Comment automation id, from any channel. Get it from `fbComments.list`, `igComments.list`, `threadsComments.list` or `tiktokComments.list`.",
)

const processMissedCommentsResponse = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("done"),
    scanned: z.number().describe("Comments found on the post in the window."),
    skipped: z
      .number()
      .describe("Comments this automation had already handled."),
    queued: z.number().describe("Comments queued to be answered now."),
    failed: z.number().describe("Comments that could not be queued."),
  }),
  z.object({
    status: z.literal("failed"),
    reason: z
      .enum([
        "notSinglePost",
        "inactive",
        "outsideSchedule",
        "workspaceInactive",
        "alreadyRunning",
        "integrationNotFound",
        "fetchFailed",
      ])
      .describe(
        "Why nothing ran: the automation must target exactly one post (`notSinglePost`), be active and inside its schedule, the workspace must be active, no run may already be in progress, and the channel must be connected.",
      ),
  }),
])

export const commentAutomationsPublicRouter = {
  processMissedComments: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/comment-automations/{id}/missed-comment-runs",
      summary: "Process missed comments",
      description: `Re-reads the last ${MISSED_COMMENTS_SCAN_DAYS} days of comments on the automation's single post and answers every one it has not handled yet. Replies and DMs are really sent, spaced out over time. Poll \`commentAutomations.getMissedCommentRun\` until the run finishes.`,
      tags: ["Comment Automations"],
    })
    .input(z.object({ id: automationIdSchema }))
    .output(processMissedCommentsResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(
      async ({ context, input }) =>
        await processMissedComments({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
    ),

  getMissedCommentRun: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/comment-automations/{id}/missed-comment-runs",
      summary: "Get missed comments run status",
      description:
        "Tells whether a run started by `commentAutomations.processMissedComments` is still scanning or replying for this automation; a new run is refused while one is in progress.",
      tags: ["Comment Automations"],
    })
    .input(z.object({ id: automationIdSchema }))
    .output(
      z.object({
        inProgress: z
          .boolean()
          .describe("Whether a missed comments run is still going."),
      }),
    )
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      await commentAutomationService.findOrFail({ workspaceId, id: input.id })
      const running =
        await commentAutomationService.findMissedCommentsInProgress({
          workspaceId,
          automationIds: [input.id],
        })
      return { inProgress: running.includes(input.id) }
    }),
}
