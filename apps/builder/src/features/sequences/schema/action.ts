import type { SequenceModel } from "@chatbotx.io/database/types"
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
import { DELAY_UNITS, isStoredDelayConsistent } from "../lib/delay"
import { sequenceResource } from "./resource"

export const listSequencesRequest = basePaginationRequest.and(
  z.object({
    workspaceId: zodBigintAsString(),
    name: z.string().nullish(),
    folderId: zodBigintAsString().nullish(),
    active: z.boolean().nullish(),
  }),
)
export type ListSequencesRequest = z.infer<typeof listSequencesRequest>

export const listSequencesSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString.withDefault(""),
  active: parseAsBoolean,
  folderId: parseAsBigInt,
  sort: getSortingStateParser<SequenceModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
})

export const listSequencesResponse = z.object({
  data: z.array(
    sequenceResource.and(
      z.object({
        stepsCount: z.number(),
        subscribersCount: z.number(),
      }),
    ),
  ),
  pageCount: z.number(),
})
export type ListSequencesResponse = z.infer<typeof listSequencesResponse>

export const createSequenceRequest = z.object({
  name: z.string().trim().min(1).max(255).describe("Sequence name."),
  folderId: zodBigintAsString()
    .nullish()
    .describe("Folder id (numeric string) to create the sequence in."),
})
export type CreateSequenceRequest = z.infer<typeof createSequenceRequest>

export const updateSequenceSchema = z
  .object({
    name: z.string().trim().min(1).max(255).describe("New sequence name."),
    active: z.boolean().describe("Whether the sequence is active."),
  })
  .partial()
export type UpdateSequenceSchema = z.infer<typeof updateSequenceSchema>

// Shared shape without the refinement — `.omit()` cannot be called on a
// zod object once `.superRefine()` has wrapped it, so the public API's
// `sequenceId`-less variant below is built by omitting from this base
// object first and re-applying `validateStepDelayConsistency` after.
const upsertSequenceStepBaseShape = z.object({
  stepId: zodBigintAsString()
    .optional()
    .describe("Existing step id to update. Omit to create a new step."),
  sequenceId: zodBigintAsString().describe("Sequence id this step belongs to."),
  order: z
    .number()
    .int()
    .min(0)
    .describe("Zero-based position of this step within the sequence."),
  delayDays: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Delay before this step, in days."),
  delayMinutes: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Delay before this step, in minutes."),
  delayUnit: z
    .enum(DELAY_UNITS)
    .optional()
    .describe("Unit the delay is expressed in."),
  specificDateTime: z.iso
    .datetime()
    .nullable()
    .optional()
    .describe(
      "Send this step at a specific ISO 8601 date/time instead of a relative delay.",
    ),
  flowId: zodBigintAsString()
    .optional()
    .describe(
      "Flow id (numeric string) to run at this step. Get it from `flows.list`.",
    ),
  isActive: z.boolean().optional().describe("Whether this step is active."),
  anytime: z
    .boolean()
    .optional()
    .describe("Whether this step can send outside of send-time hours."),
  sendTimeStart: z
    .string()
    .nullable()
    .optional()
    .describe("Earliest time of day (HH:mm) this step may send."),
  sendTimeEnd: z
    .string()
    .nullable()
    .optional()
    .describe("Latest time of day (HH:mm) this step may send."),
  sendDays: z
    .array(z.string())
    .optional()
    .describe("Days of the week this step may send on."),
})

const validateStepDelayConsistency = (
  data: {
    delayUnit?: (typeof DELAY_UNITS)[number]
    delayDays?: number
    delayMinutes?: number
    specificDateTime?: string | null
  },
  ctx: z.RefinementCtx,
) => {
  const { delayUnit, delayDays, delayMinutes, specificDateTime } = data

  if (
    delayUnit === undefined ||
    delayDays === undefined ||
    delayMinutes === undefined
  ) {
    return
  }

  if (!isStoredDelayConsistent({ delayUnit, delayDays, delayMinutes })) {
    ctx.addIssue({
      code: "custom",
      path: ["delayUnit"],
      message: "delayUnit does not match delayDays/delayMinutes",
    })
    return
  }

  if (delayUnit === "specificTime" && typeof specificDateTime !== "string") {
    ctx.addIssue({
      code: "custom",
      path: ["specificDateTime"],
      message: "specificDateTime is required for delayUnit specificTime",
    })
  }
}

export const upsertSequenceStepRequest =
  upsertSequenceStepBaseShape.superRefine(validateStepDelayConsistency)

export type UpsertSequenceStepRequest = z.infer<
  typeof upsertSequenceStepRequest
>

// The public API scopes `sequenceId` from the `{id}` path segment instead —
// see `sequencesPublicRouter.upsertStep` — so the request body must not
// also require (and then silently ignore) it.
export const publicUpsertSequenceStepRequest = upsertSequenceStepBaseShape
  .omit({ sequenceId: true })
  .superRefine(validateStepDelayConsistency)
