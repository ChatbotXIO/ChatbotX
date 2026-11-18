import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const transferWorkspaceToOwnerSchema = z.object({
  workspaceId: zodBigintAsString(),
})
