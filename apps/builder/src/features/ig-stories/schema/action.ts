import {
  fbCommentIncludeKeywordsSchema,
  fbCommentReplySchema,
  igStoryAutomationTypes,
  igStoryTargetSchema,
} from "@chatbotx.io/database/partials"
import type { IgStoryAutomationModel } from "@chatbotx.io/database/types"
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
import { igStoryResource } from "./resource"

export const listIgStoriesRequest = basePaginationRequest.and(
  z.object({
    workspaceId: zodBigintAsString(),
    name: z.string().nullish(),
    folderId: zodBigintAsString().nullish(),
    isActive: z.boolean().nullish(),
  }),
)
export type ListIgStoriesRequest = z.infer<typeof listIgStoriesRequest>

export const listIgStoriesSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString.withDefault(""),
  isActive: parseAsBoolean,
  folderId: parseAsBigInt,
  sort: getSortingStateParser<IgStoryAutomationModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
})

export const listIgStoriesResponse = z.object({
  data: z.array(igStoryResource),
  pageCount: z.number(),
})
export type ListIgStoriesResponse = z.infer<typeof listIgStoriesResponse>

export const igStoryVariants = igStoryAutomationTypes
export type IgStoryVariant = z.infer<typeof igStoryVariants>

export const createIgStoryRequest = z.object({
  name: z.string().trim().min(1).max(255),
  type: igStoryVariants,
  folderId: zodBigintAsString().nullish(),
  story: igStoryTargetSchema,
  reply: fbCommentReplySchema,
  includeKeywords: fbCommentIncludeKeywordsSchema,
})
export type CreateIgStoryRequest = z.infer<typeof createIgStoryRequest>

export const updateIgStoryRequest = createIgStoryRequest.partial().and(
  z.object({
    isActive: z.boolean().optional(),
    startTime: z.string().nullable().optional(),
    endTime: z.string().nullable().optional(),
  }),
)
export type UpdateIgStoryRequest = z.infer<typeof updateIgStoryRequest>
