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
})

export const patchMinigamePublicRequest = createMinigameRequest
  .partial()
  .extend({ id: zodBigintAsString() })
  .refine(
    (data) =>
      Object.entries(data).some(
        ([key, value]) => key !== "id" && value !== undefined,
      ),
    { message: "At least one field must be provided" },
  )

export const setMinigameEnabledPublicRequest = z.object({
  id: zodBigintAsString(),
  enabled: z.boolean(),
})

export const listMinigamePlaysPublicRequest = z.object({
  id: zodBigintAsString(),
  contactId: zodBigintAsString(),
})

export const listMinigamePlayersPublicRequest = publicListRequest.extend({
  id: zodBigintAsString(),
  name: z.string().trim().min(1).optional(),
})

export const minigamePlayerResource = z.object({
  id: z.string(),
  contactId: z.string(),
  contactInboxId: z.string().nullable(),
  played: z.number().int(),
  remaining: z.number().int(),
  sharesCount: z.number().int(),
  openedAt: z.date(),
  lastPlayedAt: z.date(),
  contact: z.object({
    id: z.string(),
    fullName: z.string().nullable(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    avatar: z.string().nullable(),
  }),
})

export const listMinigamePlayersPublicResponse = publicListResponse(
  minigamePlayerResource,
)

export const minigamePlayResource = z.object({
  id: z.string(),
  isWinning: z.boolean(),
  prizeName: z.string().nullable(),
  createdAt: z.date(),
})

export const listMinigamePlaysPublicResponse = z.object({
  data: z
    .array(minigamePlayResource)
    .describe(
      "A contact's most recent plays, newest first, capped at 200 records.",
    ),
})
