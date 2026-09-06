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
  // Must stay in lockstep with `getMinigameContactListOrder`'s switch in
  // `packages/business/src/minigame/minigame-contact-service.ts` — a column
  // missing from either list silently refuses to sort, with no type error.
  sort: getSortingStateParser<{
    name: string
    played: number
    remaining: number
    sharesCount: number
    openedAt: Date
    lastPlayedAt: Date
  }>([
    "name",
    "played",
    "remaining",
    "sharesCount",
    "openedAt",
    "lastPlayedAt",
  ]).withDefault([]),
}
export const listMinigameHistorySearchParamsCache = createSearchParamsCache(
  listMinigameHistorySearchParams,
)

export type ListMinigameHistoryRequest = Awaited<
  ReturnType<typeof listMinigameHistorySearchParamsCache.parse>
> & { workspaceId: string; minigameId: string }
