import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import { createMinigameRequest, updateMinigameRequest } from "./action"
import { minigameResource } from "./resource"

export const listMinigamesPublicRequest = publicListRequest.extend({
  name: z.string().trim().min(1).optional(),
})

export const minigamePublicResource = minigameResource.omit({
  workspaceId: true,
})

export const listMinigamesPublicResponse = publicListResponse(
  minigamePublicResource,
)

export const createMinigamePublicRequest = createMinigameRequest

export const updateMinigamePublicRequest = updateMinigameRequest.extend({
  id: zodBigintAsString(),
  originalPrizeQuantities: z
    .record(z.string(), z.number().int().min(0).optional())
    .default({}),
})

export const setMinigameEnabledPublicRequest = z.object({
  id: zodBigintAsString(),
  enabled: z.boolean(),
})

export const listMinigamePlaysPublicRequest = z.object({
  id: zodBigintAsString(),
  contactId: zodBigintAsString(),
})

export const minigamePlayResource = z.object({
  id: z.string(),
  isWinning: z.boolean(),
  prizeName: z.string().nullable(),
  createdAt: z.date(),
})

export const listMinigamePlaysPublicResponse = z.object({
  data: z.array(minigamePlayResource),
})
