import { aiFunctionModel, createSelectSchema } from "@aha.chat/database/schema"

export const aiFunctionResource = createSelectSchema(aiFunctionModel)
