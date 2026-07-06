import {
  channelTypes,
  conversationBotCategories,
  conversationStatuses,
} from "@chatbotx.io/database/partials"
import z from "zod"
import { contactFilterCriteriaSchema } from "@/features/contact-filter"
import { cursorPaginationRequest } from "@/lib/pagination"
import { workspaceTokenAuthAPI } from "@/orpc"
import { listConversations } from "../queries/list-conversations.query"
import { listConversationsResponse } from "../schema/resource"

function jsonQueryParam<T>(schema: z.ZodType<T>) {
  return z.preprocess((val) => {
    if (val === undefined || val === null || val === "") {
      return
    }
    try {
      return JSON.parse(decodeURIComponent(String(val)))
    } catch {
      return
    }
  }, schema)
}

const listConversationsQueryRequest = z.object({
  botCategory: conversationBotCategories.optional(),
  assignedId: z.string().nullable().optional(),
  channel: channelTypes.optional(),
  status: jsonQueryParam(z.array(conversationStatuses).optional()),
  keyword: z.string().optional(),
  botEnabled: z.preprocess((val) => {
    if (val === "true") {
      return true
    }
    if (val === "false") {
      return false
    }
    return val
  }, z.boolean().nullish()),
  tags: jsonQueryParam(
    z
      .array(
        z.enum(["noAdminReply", "unread", "followUp", "archived", "blocked"]),
      )
      .optional(),
  ),
  contactFilter: jsonQueryParam(contactFilterCriteriaSchema.optional()),
  ...cursorPaginationRequest.shape,
})

export const conversationWorkspaceTokenAPIs = {
  listConversationsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/conversations",
      summary: "List conversations",
      tags: ["Conversations"],
    })
    .input(listConversationsQueryRequest)
    .output(listConversationsResponse)
    .handler(
      async ({ context, input }) =>
        await listConversations({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),
}

export default conversationWorkspaceTokenAPIs
