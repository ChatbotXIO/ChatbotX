import { zodBigintAsString, zodBigintIdAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const POLL_NAME_MAX = 80
export const POLL_CANDIDATE_NAME_MAX = 60
export const POLL_CANDIDATE_DESCRIPTION_MAX = 500

export const pollCandidateRequest = z.object({
  id: zodBigintIdAsString()
    .optional()
    .describe(
      "Existing candidate id to keep (and keep its votes). Omit to add a new candidate. Get ids from `polls.get`.",
    ),
  name: z
    .string()
    .trim()
    .min(1)
    .max(POLL_CANDIDATE_NAME_MAX)
    .describe("Candidate name, up to 60 characters."),
  description: z
    .string()
    .trim()
    .max(POLL_CANDIDATE_DESCRIPTION_MAX)
    .nullish()
    .describe("Optional description, up to 500 characters."),
  imageUrl: z.url().nullish().describe("Optional candidate image URL."),
})

export const pollFormRequest = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(POLL_NAME_MAX)
    .describe("Poll name, up to 80 characters."),
  imageUrl: z.url().describe("Poll cover image URL."),
  startsAt: z.iso
    .datetime({ offset: true })
    .describe("When voting opens, ISO 8601 date-time."),
  endsAt: z.iso
    .datetime({ offset: true })
    .describe(
      "When voting closes (exclusive), ISO 8601 date-time. Must be after `startsAt`.",
    ),
  afterVoteFlowId: zodBigintIdAsString()
    .nullish()
    .describe(
      "Flow to run after a new or changed vote, or null for none. Get it from `flows.list`.",
    ),
  candidates: z
    .array(pollCandidateRequest)
    .describe(
      "Candidates in display order. Between 2 and 10 are required (otherwise `pollCandidateCount`).",
    ),
})

export const pollPatchRequest = pollFormRequest.partial()

/** True when a PATCH body carries at least one field other than the ids. */
export const hasPollUpdateField = (value: Record<string, unknown>) =>
  Object.entries(value).some(
    ([key, v]) => key !== "id" && key !== "workspaceId" && v !== undefined,
  )
export const hasPollUpdateFieldMessage = {
  message: "Send at least one field to update.",
}

export const pollIdRequest = z.object({
  id: zodBigintIdAsString().describe("Poll id. Get it from `polls.list`."),
})

export const pollBulkDeleteRequest = z.object({
  ids: z
    .array(zodBigintAsString())
    .min(1)
    .describe("Poll ids to delete. Get them from `polls.list`."),
})
