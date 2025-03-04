import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import { z } from "zod"
import type { AutomatedResponse } from "@ahachat.ai/database/browser"
import type { FlowResource } from "@/features/flows/schemas/get-flows-schema"

export const listAutomatedResponsesNuqs = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  keyword: parseAsString.withDefault(""),
})

export const listAutomatedResponsesRequest = z.object({
  chatbotId: z.string().cuid2(),
  page: z.number().int().min(1).default(1).optional(),
  perPage: z.number().int().min(1).default(10).optional(),
  keyword: z.string().optional(),
})

export type ListAutomatedResponsesRequest = Awaited<
  ReturnType<typeof listAutomatedResponsesNuqs.parse>
> & { chatbotId: string }

export const findAutomatedResponseRequest = z.object({
  chatbotId: z.string().cuid2(),
  id: z.string().cuid2(),
})

export type FindAutomatedResponseRequest = z.infer<
  typeof findAutomatedResponseRequest
>

export type AutomatedResponseResource = AutomatedResponse & {
  flow?: FlowResource
}

export type AutomatedResponseCollection = {
  data: AutomatedResponseResource[]
  pageCount: number
}
