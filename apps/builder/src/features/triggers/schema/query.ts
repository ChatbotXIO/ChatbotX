import type { TriggerModel } from "@chatbotx.io/database/types"
import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import { zodBigintAsString } from "@chatbotx.io/utils"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import z from "zod"
import { contactResource } from "@/features/contacts/schemas/resource"
import { userResource } from "@/features/users/schemas/resource"
import { parseAsBigInt } from "@/lib/nuqs"
import { triggerResource } from "./resource"

export const getTriggersSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: getSortingStateParser<TriggerModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
  name: parseAsString.withDefault(""),
  folderId: parseAsBigInt,
})

export type GetTriggersSchema = Awaited<
  ReturnType<typeof getTriggersSearchParamsCache.parse>
> & {
  workspaceId: string
}

export const listTriggersRequest = z.object({
  workspaceId: zodBigintAsString(),
  page: z.number().optional(),
  perPage: z.number().optional(),
  name: z.string().optional(),
  folderId: zodBigintAsString().optional(),
})
export type ListTriggersRequest = z.infer<typeof listTriggersRequest>

export const listTriggersResponse = z.object({
  data: z.array(
    triggerResource.extend({
      user: userResource.optional(),
      contact: contactResource.optional(),
    }),
  ),
  pageCount: z.number(),
})
export type ListTriggersResponse = z.infer<typeof listTriggersResponse>
