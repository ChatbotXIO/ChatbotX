import {
  commentExcludeKeywordsTypes,
  commentHideCommentsSchema,
  commentIncludeKeywordsSchema,
  commentOptionsSchema,
  commentPostSchema,
  commentReplyAfterSchema,
  commentReplySchema,
  igCommentAutomationTypes,
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
import { igCommentResource } from "./resource"

export const listIgCommentsRequest = basePaginationRequest.and(
  z.object({
    workspaceId: zodBigintAsString(),
    name: z.string().nullish(),
    folderId: zodBigintAsString().nullish(),
    isActive: z.boolean().nullish(),
  }),
)
export type ListIgCommentsRequest = z.infer<typeof listIgCommentsRequest>

export const listIgCommentsSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString.withDefault(""),
  isActive: parseAsBoolean,
  folderId: parseAsBigInt,
  sort: getSortingStateParser<CommentAutomationModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
})

export const listIgCommentsResponse = z.object({
  data: z.array(igCommentResource),
  pageCount: z.number(),
})
export type ListIgCommentsResponse = z.infer<typeof listIgCommentsResponse>

export const igCommentVariants = igCommentAutomationTypes
export type IgCommentVariant = z.infer<typeof igCommentVariants>

export const createIgCommentRequest = z.object({
  name: z.string().trim().min(1).max(255).describe("Automation name."),
  type: igCommentVariants.describe(
    "Instagram connection type, `instagram` (native login) or `instagramFacebook` (linked via a Facebook page).",
  ),
  folderId: zodBigintAsString()
    .nullish()
    .describe("Folder to place the automation in, or null for root-level."),
  post: commentPostSchema.describe(
    "Instagram media to watch for comments. Get it from `igComments.listMedia`.",
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
  // Optional, never defaulted: `updateFbCommentRequest` is this schema made
  // `.partial()`, and a default would reset the stored match type on every
  // PATCH that did not mention it. The column defaults to `contain`.
  excludeKeywordsType: commentExcludeKeywordsTypes
    .optional()
    .describe(
      "How `excludeKeywords` match: `equal` (the whole comment) or `contain` (anywhere in it).",
    ),
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
export type CreateIgCommentRequest = z.infer<typeof createIgCommentRequest>

export const updateIgCommentRequest = createIgCommentRequest.partial().and(
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
export type UpdateIgCommentRequest = z.infer<typeof updateIgCommentRequest>
