import {
  createSelectSchema,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import type { z } from "zod"

const workspaceResource = createSelectSchema(workspaceModel, {
  id: zodBigintAsString(),
})

export const publicWorkspaceResource = workspaceResource.omit({ token: true })
export type PublicWorkspaceResource = z.infer<typeof publicWorkspaceResource>
