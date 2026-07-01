import {
  fbCommentHideCommentsSchema,
  fbCommentIncludeKeywordsSchema,
  fbCommentOptionsSchema,
  fbCommentPostSchema,
  fbCommentReplyAfterSchema,
  fbCommentReplySchema,
} from "@chatbotx.io/database/partials"
import type { FBCommentAutomationModel } from "@chatbotx.io/database/types"
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
  sort: getSortingStateParser<FBCommentAutomationModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
})

export const listFbCommentsResponse = z.object({
  data: z.array(fbCommentResource),
  pageCount: z.number(),
})
export type ListFbCommentsResponse = z.infer<typeof listFbCommentsResponse>

export const createFbCommentRequest = z.object({
  name: z.string().trim().min(1).max(255),
  folderId: zodBigintAsString().nullish(),
  post: fbCommentPostSchema,
  privateReply: fbCommentReplySchema,
  publicReply: fbCommentReplySchema,
  includeKeywords: fbCommentIncludeKeywordsSchema,
  excludeKeywords: z.array(z.string()),
  options: fbCommentOptionsSchema,
  hideComments: fbCommentHideCommentsSchema,
  replyAfter: fbCommentReplyAfterSchema,
})
export type CreateFbCommentRequest = z.infer<typeof createFbCommentRequest>

export const updateFbCommentRequest = createFbCommentRequest.partial().and(
  z.object({
    isActive: z.boolean().optional(),
    startTime: z.string().nullable().optional(),
    endTime: z.string().nullable().optional(),
  }),
)
export type UpdateFbCommentRequest = z.infer<typeof updateFbCommentRequest>
