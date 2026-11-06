import { z } from "zod"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import {
  hasPollUpdateField,
  hasPollUpdateFieldMessage,
  pollIdRequest,
  pollPatchRequest,
} from "./action"

export { pollBulkDeleteRequest, pollFormRequest, pollIdRequest } from "./action"

export const listPollsPublicRequest = publicListRequest.extend({
  name: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Case-insensitive substring match against the poll name."),
})

const pollStateSchema = z
  .enum(["notStarted", "running", "ended"])
  .describe("Running iff startsAt <= now < endsAt.")

const pollBase = z.object({
  id: z.string(),
  name: z.string(),
  imageUrl: z.string(),
  startsAt: z.string().describe("ISO 8601 date-time."),
  endsAt: z.string().describe("ISO 8601 date-time (exclusive)."),
  afterVoteFlowId: z.string().nullable(),
  state: pollStateSchema,
  createdAt: z.string().describe("ISO 8601 date-time."),
  updatedAt: z.string().describe("ISO 8601 date-time."),
})

export const pollListItemResource = pollBase.extend({
  votesCount: z.number().describe("Total votes across all candidates."),
})

export const pollCandidateResource = z.object({
  id: z.string(),
  position: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  votesCount: z.number().describe("Votes this candidate has."),
})

export const pollResource = pollBase.extend({
  candidates: z.array(pollCandidateResource),
})

export const listPollsPublicResponse = publicListResponse(pollListItemResource)

export const updatePollPublicRequest = pollPatchRequest
  .extend(pollIdRequest.shape)
  .refine(hasPollUpdateField, hasPollUpdateFieldMessage)

export const pollLinksResource = z.object({
  omnichannelUrl: z
    .string()
    .describe(
      "One link for every channel; opens the channel picker (or redirects when only one channel is connected).",
    ),
  links: z.array(
    z.object({
      inboxId: z.string().describe("Inbox id (`inboxes.list`)."),
      channel: z.string(),
      name: z.string(),
      url: z
        .string()
        .describe("Deep link that opens a chat and starts the poll."),
    }),
  ),
})

const analyticsCandidate = z.object({
  id: z.string(),
  name: z.string(),
  imageUrl: z.string().nullable(),
  totalVotes: z.number(),
  totalPercent: z.number(),
  maleVotes: z.number(),
  malePercent: z.number(),
  femaleVotes: z.number(),
  femalePercent: z.number(),
})

export const pollAnalyticsResource = z.object({
  poll: z
    .object({
      id: z.string(),
      name: z.string(),
      imageUrl: z.string(),
      startsAt: z.string().describe("ISO 8601 date-time."),
      endsAt: z.string().describe("ISO 8601 date-time (exclusive)."),
    })
    .describe("The poll these analytics belong to."),
  totalVotes: z.number(),
  gender: z.object({
    male: z.number(),
    female: z.number(),
    unknown: z.number(),
  }),
  candidates: z.array(analyticsCandidate),
})

export const bulkDeletePollsResponse = z.object({
  deleted: z.number().describe("How many polls were deleted."),
})
