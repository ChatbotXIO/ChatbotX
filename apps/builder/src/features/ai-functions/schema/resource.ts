import {
  aiFunctionModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils/zod"

export const aiFunctionResource = createSelectSchema(aiFunctionModel, {
  id: zodBigintAsString(),
  workspaceId: zodBigintAsString(),
})
