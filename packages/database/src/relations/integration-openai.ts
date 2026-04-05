import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const integrationOpenaiRelations = defineRelationsPart(schema, (r) => ({
  integrationOpenaiModel: {
    aiAgent: r.one.aiAgentModel({
      from: r.integrationOpenaiModel.aiAgentId,
      to: r.aiAgentModel.id,
    }),
    aiAssistant: r.one.aiAssistantModel({
      from: r.integrationOpenaiModel.aiAssistantId,
      to: r.aiAssistantModel.id,
    }),
    workspace: r.one.workspaceModel({
      from: r.integrationOpenaiModel.workspaceId,
      to: r.workspaceModel.id,
    }),
    integration: r.one.integrationModel({
      from: r.integrationOpenaiModel.integrationId,
      to: r.integrationModel.id,
    }),
  },
}))
