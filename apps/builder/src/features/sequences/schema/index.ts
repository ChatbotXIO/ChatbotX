import { createSelectSchema, sequenceModel } from "@aha.chat/database/schema"
import type { SequenceModel } from "@aha.chat/database/types"
import { getSortingStateParser } from "@aha.chat/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import z from "zod"
import { basePaginationRequest } from "@/lib/pagination"

export const sequenceResource = createSelectSchema(sequenceModel)
export type SequenceResource = typeof sequenceModel.$inferSelect

export const listSequencesRequest = basePaginationRequest.and(
  z.object({
    chatbotId: z.cuid2(),
    name: z.string().nullish(),
    folderId: z.string().nullish(),
    active: z.boolean().nullish(),
  }),
)
export type ListSequencesRequest = z.infer<typeof listSequencesRequest>

export const listSequencesSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString.withDefault(""),
  active: parseAsBoolean,
  folderId: parseAsString,
  sort: getSortingStateParser<SequenceModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
})

export const listSequencesItem = sequenceResource.and(
  z.object({
    stepsCount: z.number(),
    subscribersCount: z.number(),
  }),
)
export type ListSequencesItem = z.infer<typeof listSequencesItem>

export const listSequencesResponse = z.object({
  data: z.array(listSequencesItem),
  pageCount: z.number(),
})
export type ListSequencesResponse = z.infer<typeof listSequencesResponse>

export const createSequenceRequest = z.object({
  name: z.string().trim().min(1).max(255),
  folderId: z.cuid2().nullish(),
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
  stepId: z.cuid2().optional(),
  sequenceId: z.cuid2(),
  order: z.number().int().min(0),
  delayDays: z.number().int().min(0).optional(),
  delayMinutes: z.number().int().min(0).optional(),
  delayUnit: z
    .enum(["immediate", "minutes", "hours", "days", "specificTime"])
    .optional(),
  specificDateTime: z.iso.datetime().optional(),
  flowId: z.cuid2().optional(),
  isActive: z.boolean().optional(),
  anytime: z.boolean().optional(),
  sendTimeStart: z.string().nullable().optional(),
  sendTimeEnd: z.string().nullable().optional(),
  sendDays: z.array(z.string()).optional(),
})

export type UpsertSequenceStepRequest = z.infer<
  typeof upsertSequenceStepRequest
>
