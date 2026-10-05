import {
  commentAutomationContactData,
  commentAutomationEventType,
} from "@chatbotx.io/analytics/schemas"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { withPublicPaging } from "@/lib/public-api/list"

// The per-counter contacts drill-down, next to the `analytics.commentAutomation*`
// range routes in `./public.ts`. Same `comment-automation` path family; one
// surface for every channel because `CommentAutomation` is a single table.

export const commentAutomationContactsPublicRequest = withPublicPaging(
  z.object({
    automationId: zodBigintAsString().describe(
      "Comment automation id, from any channel. Get it from `fbComments.list`, `igComments.list`, `threadsComments.list` or `tiktokComments.list`.",
    ),
    eventType: commentAutomationEventType.describe(
      "Which counter to list the contacts behind: `message:sent`, `message:delivered`, `message:seen`, `message:failed`, `flow:clicked`, or `comment:missed`.",
    ),
  }),
)

/**
 * PII minimization, same as `linkContactPublicResource`: this sits behind the
 * `analytics` scope, not `contacts`, so names and avatars are dropped.
 */
export const commentAutomationContactPublicResource =
  commentAutomationContactData.omit({
    firstName: true,
    lastName: true,
    fullName: true,
    avatar: true,
  })

export const commentAutomationContactsPublicResponse = z.object({
  data: z.array(commentAutomationContactPublicResource),
  total: z
    .number()
    .describe("Events behind the counter — the automation's lifetime count."),
  contactTotal: z.number().describe("Distinct contacts behind those events."),
  page: z.number(),
  pageCount: z.number(),
})
