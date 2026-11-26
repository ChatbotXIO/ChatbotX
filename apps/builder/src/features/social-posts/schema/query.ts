import {
  socialPostBuckets,
  socialPostStatuses,
  socialProviders,
} from "@chatbotx.io/database/partials"
import {
  isValidPostgresTimestampWithOffset,
  POSTGRES_TIMESTAMP_WITH_OFFSET,
} from "@chatbotx.io/utils/postgres-timestamp"
import { z } from "zod"
import {
  destinationScheduleRequest,
  MAX_TOPICS,
  postId,
  socialPostIdRequest,
} from "./request"

const MAX_FILTER_VALUES = 200

/** A lone `?x=a` stays a string in query parsing; wrap it so it reads as a list. */
const queryArray = <Item extends z.ZodType>(item: Item, max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" ? [value] : value),
    z.array(item).max(max),
  )

export const socialPostCursor = z.object({
  createdAt: z
    .string()
    .regex(POSTGRES_TIMESTAMP_WITH_OFFSET)
    .refine(isValidPostgresTimestampWithOffset, {
      message: "Must be a valid PostgreSQL timestamp with offset",
    }),
  id: postId,
})

export const listSocialPostsRequest = z.strictObject({
  bucket: socialPostBuckets
    .optional()
    .describe(
      "Only posts in this group, the same groups `socialPosts.counts` counts: `drafts`, `scheduled` (scheduled or publishing), `published`, or `needsAttention` (failed, partially published, or a destination that failed or needs review). A post is in exactly one group; a cancelled post is in none.",
    ),
  cursor: socialPostCursor
    .optional()
    .describe("Cursor from an earlier response, to get the next page."),
  destinationIds: queryArray(postId, MAX_FILTER_VALUES)
    .optional()
    .describe(
      "Only posts with a target on these destinations (`publishDestinations.list`).",
    ),
  from: z.coerce
    .date()
    .optional()
    .describe(
      "Only posts with a destination scheduled (or published) at or after this instant (UTC).",
    ),
  inboxIds: queryArray(postId, MAX_FILTER_VALUES)
    .optional()
    .describe(
      "Only posts with a target on the destination of these inboxes (`inboxes.list`).",
    ),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(30)
    .describe("Maximum number of posts to return (1-100, default 30)."),
  providers: queryArray(socialProviders, socialProviders.options.length)
    .optional()
    .describe("Only posts with a destination on these networks."),
  search: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe("Text found in the post text or link."),
  statuses: queryArray(socialPostStatuses, socialPostStatuses.options.length)
    .optional()
    .describe("Only posts in these states."),
  to: z.coerce
    .date()
    .optional()
    .describe(
      "Only posts with a destination scheduled (or published) at or before this instant (UTC).",
    ),
  topicIds: queryArray(postId, MAX_TOPICS)
    .optional()
    .describe("Only posts that carry at least one of these topics."),
})

export const countSocialPostsRequest = z.strictObject({
  destinationIds: listSocialPostsRequest.shape.destinationIds,
  inboxIds: listSocialPostsRequest.shape.inboxIds,
  providers: listSocialPostsRequest.shape.providers,
})

export const countSocialPostsResponse = z.object({
  all: z.number().int().describe("Every post, cancelled ones included."),
  drafts: z.number().int().describe("Posts saved as drafts."),
  needsAttention: z
    .number()
    .int()
    .describe(
      "Posts that failed, were partially published, or have a destination that failed or needs review.",
    ),
  published: z.number().int().describe("Posts published on every destination."),
  scheduled: z
    .number()
    .int()
    .describe("Posts waiting for their time or being published."),
})

export const listFreeSlotsRequest = destinationScheduleRequest.extend({
  after: z.coerce
    .date()
    .optional()
    .describe("Only times after this instant. Defaults to now."),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("How many times to return (1-50, default 10)."),
})

export const listSocialPostOccurrencesRequest = socialPostIdRequest.extend({
  cursor: z
    .object({ id: postId, occurrenceAt: z.iso.datetime({ offset: true }) })
    .optional()
    .describe("Cursor from an earlier response."),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(30)
    .describe("Maximum number of runs to return (1-100, default 30)."),
})
