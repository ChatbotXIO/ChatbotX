import type { MinigameModel } from "@chatbotx.io/database/types"
import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import z from "zod"
import { minigameResource } from "./resource"

export const listMinigamesSearchParams = {
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString,
  sort: getSortingStateParser<MinigameModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
}
export const listMinigamesSearchParamsCache = createSearchParamsCache(
  listMinigamesSearchParams,
)

export type ListMinigamesRequest = Awaited<
  ReturnType<typeof listMinigamesSearchParamsCache.parse>
> & { workspaceId: string }

export const listMinigamesResponse = z.object({
  data: z.array(minigameResource),
  pageCount: z.number(),
})
export type ListMinigamesResponse = z.infer<typeof listMinigamesResponse>

export const listMinigameHistorySearchParams = {
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString,
  sort: getSortingStateParser<{
    name: string
    played: number
    remaining: number
    openedAt: Date
    lastPlayedAt: Date
  }>(["name", "played", "remaining", "openedAt", "lastPlayedAt"]).withDefault(
    [],
  ),
}
export const listMinigameHistorySearchParamsCache = createSearchParamsCache(
  listMinigameHistorySearchParams,
)

export type ListMinigameHistoryRequest = Awaited<
  ReturnType<typeof listMinigameHistorySearchParamsCache.parse>
> & { workspaceId: string; minigameId: string }
