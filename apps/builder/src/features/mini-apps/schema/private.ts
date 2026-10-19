import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const listMiniAppOptionsRequest = z.object({
  workspaceId: zodBigintAsString(),
})

export const listMiniAppOptionsResponse = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
  }),
)
