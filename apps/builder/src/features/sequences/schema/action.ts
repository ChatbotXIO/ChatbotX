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
  name: z.string().trim().min(1).max(255),
  folderId: zodBigintAsString().nullish(),
})
export type CreateSequenceRequest = z.infer<typeof createSequenceRequest>

export const updateSequenceSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    active: z.boolean(),
  })
  .partial()
export type UpdateSequenceSchema = z.infer<typeof updateSequenceSchema>

export const upsertSequenceStepRequest = z.object({
  stepId: zodBigintAsString().optional(),
  sequenceId: zodBigintAsString(),
  order: z.number().int().min(0),
  delayDays: z.number().int().min(0).optional(),
  delayMinutes: z.number().int().min(0).optional(),
  delayUnit: z
    .enum(["immediate", "minutes", "hours", "days", "specificTime"])
    .optional(),
  specificDateTime: z.iso.datetime().optional(),
  flowId: zodBigintAsString().optional(),
  isActive: z.boolean().optional(),
  anytime: z.boolean().optional(),
  sendTimeStart: z.string().nullable().optional(),
  sendTimeEnd: z.string().nullable().optional(),
  sendDays: z.array(z.string()).optional(),
})

export type UpsertSequenceStepRequest = z.infer<
  typeof upsertSequenceStepRequest
>
