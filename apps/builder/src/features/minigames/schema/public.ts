import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import { createMinigameRequest, updateMinigameRequest } from "./action"
import { minigameResource } from "./resource"

export const listMinigamesPublicRequest = publicListRequest.extend({
  name: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Case-insensitive substring match against the minigame's name."),
})

export const minigamePublicResource = minigameResource
  .omit({
    workspaceId: true,
  })
  .extend({
    playUrl: z
      .string()
      .describe(
        "Public play link (the dashboard's Copy URL). Put it in a flow button or message as-is: `{{minigame_play_token}}` is filled per contact when the flow sends it, which is how a play is attributed. Opened outside a flow, the token is missing and the page cannot identify the player.",
      ),
  })

export const listMinigamesPublicResponse = publicListResponse(
  minigamePublicResource,
)

export const createMinigamePublicRequest = createMinigameRequest

export const updateMinigamePublicRequest = updateMinigameRequest.extend({
  id: zodBigintAsString().describe(
    "Minigame id. Get it from `minigames.list`.",
  ),
})

export const patchMinigamePublicRequest = createMinigameRequest
  .partial()
  .extend({
    id: zodBigintAsString().describe(
      "Minigame id. Get it from `minigames.list`.",
    ),
  })
  .refine(
    (data) =>
      Object.entries(data).some(
        ([key, value]) => key !== "id" && value !== undefined,
      ),
    { message: "At least one field must be provided" },
  )

export const setMinigameEnabledPublicRequest = z.object({
  id: zodBigintAsString().describe(
    "Minigame id. Get it from `minigames.list`.",
  ),
  enabled: z.boolean().describe("Whether the minigame should be playable."),
})

export const listMinigamePlaysPublicRequest = z.object({
  id: zodBigintAsString().describe(
    "Minigame id. Get it from `minigames.list`.",
  ),
  contactId: zodBigintAsString().describe(
    "Contact id. Get it from `contacts.list`.",
  ),
})

export const listMinigamePlayersPublicRequest = publicListRequest.extend({
  id: zodBigintAsString().describe(
    "Minigame id. Get it from `minigames.list`.",
  ),
  name: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "Case-insensitive substring match against the player's contact name.",
    ),
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
