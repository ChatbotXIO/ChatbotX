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
  name: z.string().trim().min(1).max(255).describe("Automation name."),
  type: igStoryVariants.describe(
    "Instagram connection type, `instagram` (native login) or `instagramFacebook` (linked via a Facebook page).",
  ),
  folderId: zodBigintAsString()
    .nullish()
    .describe("Folder to place the automation in, or null for root-level."),
  story: igStoryTargetSchema.describe(
    "Instagram story to watch for replies/mentions. Get it from `igStories.listStories`.",
  ),
  reply: fbCommentReplySchema.describe(
    "Private message reply sent to the contact.",
  ),
  includeKeywords: fbCommentIncludeKeywordsSchema.describe(
    "Only trigger when the reply matches these keywords.",
  ),
})
export type CreateIgStoryRequest = z.infer<typeof createIgStoryRequest>

export const updateIgStoryRequest = createIgStoryRequest.partial().and(
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
export type UpdateIgStoryRequest = z.infer<typeof updateIgStoryRequest>
