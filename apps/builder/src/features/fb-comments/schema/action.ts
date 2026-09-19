import {
  commentHideCommentsSchema,
  commentIncludeKeywordsSchema,
  commentOptionsSchema,
  commentPostSchema,
  commentReplyAfterSchema,
  commentReplySchema,
} from "@chatbotx.io/database/partials"
import type { CommentAutomationModel } from "@chatbotx.io/database/types"
import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import { zodBigintAsString } from "@chatbotx.io/utils"
import {
  createSearchParamsCache,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import z from "zod"
import { parseAsBigInt } from "@/lib/nuqs"
import { basePaginationRequest } from "@/lib/pagination"
import { fbCommentResource } from "./resource"

export const listFbCommentsRequest = basePaginationRequest.and(
  z.object({
    workspaceId: zodBigintAsString(),
    name: z.string().nullish(),
    folderId: zodBigintAsString().nullish(),
    isActive: z.boolean().nullish(),
  }),
)
export type ListFbCommentsRequest = z.infer<typeof listFbCommentsRequest>

export const listFbCommentsSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString.withDefault(""),
  isActive: parseAsBoolean,
  folderId: parseAsBigInt,
  sort: getSortingStateParser<CommentAutomationModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
})

export const listFbCommentsResponse = z.object({
  data: z.array(fbCommentResource),
  pageCount: z.number(),
})
export type ListFbCommentsResponse = z.infer<typeof listFbCommentsResponse>

export const createFbCommentRequest = z.object({
  name: z.string().trim().min(1).max(255).describe("Automation name."),
  type: z
    .literal("messenger")
    .default("messenger")
    .describe("Automation channel type."),
  folderId: zodBigintAsString()
    .nullish()
    .describe("Folder to place the automation in, or null for root-level."),
  post: commentPostSchema.describe(
    "Facebook post to watch for comments. Get it from `fbComments.listPosts`.",
  ),
  privateReply: commentReplySchema.describe(
    "Private message reply sent to the commenter, if any.",
  ),
  publicReply: commentReplySchema.describe(
    "Public comment reply posted under the comment, if any.",
  ),
  includeKeywords: commentIncludeKeywordsSchema.describe(
    "Only trigger when the comment matches these keywords.",
  ),
  excludeKeywords: z
    .array(z.string())
    .describe("Never trigger when the comment matches these keywords."),
  options: commentOptionsSchema.describe(
    "Matching and trigger behavior options.",
  ),
  hideComments: commentHideCommentsSchema.describe(
    "Whether to hide matching comments after replying.",
  ),
  replyAfter: commentReplyAfterSchema.describe(
    "Delay before sending the reply.",
  ),
})
export type CreateFbCommentRequest = z.infer<typeof createFbCommentRequest>

export const updateFbCommentRequest = createFbCommentRequest.partial().and(
  z.object({
    isActive: z
      .boolean()
      .optional()
      .describe("Whether the automation is enabled."),
    startTime: z
      .string()
      .nullable()
      .optional()
      .describe(
        "When the automation starts being active, or null for immediately.",
      ),
    endTime: z
      .string()
      .nullable()
      .optional()
      .describe("When the automation stops being active, or null for never."),
  }),
)
export type UpdateFbCommentRequest = z.infer<typeof updateFbCommentRequest>
