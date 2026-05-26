import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const deleteWorkspaceRequest = z.object({
  id: zodBigintAsString(),
  confirmName: z.string(),
})
export type DeleteWorkspaceRequest = z.infer<typeof deleteWorkspaceRequest>
