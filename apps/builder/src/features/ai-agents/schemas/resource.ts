import { aiAgentModel, createSelectSchema } from "@aha.chat/database/schema"

export const aiAgentResourceSchema = createSelectSchema(aiAgentModel)
