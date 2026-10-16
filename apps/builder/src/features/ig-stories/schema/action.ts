import type { IgStoryAutomationTrigger } from "@chatbotx.io/database/partials"
import {
  commentIncludeKeywordsSchema,
  commentReplySchema,
  igStoryAutomationTriggers,
  igStoryAutomationTypes,
  igStoryTargetSchema,
} from "@chatbotx.io/database/partials"
import type { IgStoryAutomationModel } from "@chatbotx.io/database/types"
import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import { zodBigintAsString } from "@chatbotx.io/utils"
import {
  createSearchParamsCache,
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server"
import z from "zod"
import { automationInboxIdSchema } from "@/features/shared/comment-automation/schema/account"
import { parseAsBigInt } from "@/lib/nuqs"
import { basePaginationRequest } from "@/lib/pagination"
import { igStoryResource } from "./resource"

export const listIgStoriesRequest = basePaginationRequest.and(
  z.object({
    workspaceId: zodBigintAsString(),
    name: z.string().nullish(),
    folderId: zodBigintAsString().nullish(),
    isActive: z.boolean().nullish(),
    trigger: igStoryAutomationTriggers.nullish(),
  }),
)
export type ListIgStoriesRequest = z.infer<typeof listIgStoriesRequest>

export const listIgStoriesSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString.withDefault(""),
  isActive: parseAsBoolean,
  folderId: parseAsBigInt,
  // The table's select filter writes a comma-separated list.
  trigger: parseAsArrayOf(
    parseAsStringLiteral(igStoryAutomationTriggers.options),
    ",",
  ),
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
  trigger: igStoryAutomationTriggers
    .optional()
    .describe(
      "What starts the automation: `storyReply` (default) when a contact replies to one of your stories, `storyMention` when a contact tags your account in their own story. Set once at creation; it cannot be changed later.",
    ),
  inboxId: automationInboxIdSchema,
  folderId: zodBigintAsString()
    .nullish()
    .describe("Folder to place the automation in, or null for root-level."),
  story: igStoryTargetSchema.describe(
    "Instagram stories to watch for replies. Get story ids from `igStories.listStories`. Ignored (always `all`) when `trigger` is `storyMention`.",
  ),
  reply: commentReplySchema.describe(
    "Private message reply sent to the contact.",
  ),
  includeKeywords: commentIncludeKeywordsSchema.describe(
    "Only trigger when the reply matches these keywords. Ignored (always `all`) when `trigger` is `storyMention`.",
  ),
})
export type CreateIgStoryRequest = z.infer<typeof createIgStoryRequest>

/** The table filter allows several values; the list only narrows on exactly one. */
export function resolveTriggerFilter(
  triggers: readonly IgStoryAutomationTrigger[] | null,
): IgStoryAutomationTrigger | null {
  return triggers?.length === 1 ? (triggers[0] ?? null) : null
}

// `trigger` is chosen at creation only, so the update schema never carries it.
export const updateIgStoryRequest = createIgStoryRequest
  .omit({ trigger: true })
  .partial()
  .and(
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
