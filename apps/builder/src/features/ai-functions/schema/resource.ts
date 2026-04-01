import {
  aiFunctionModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"

export const aiFunctionResource = createSelectSchema(aiFunctionModel)
