import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const integrationRelations = defineRelationsPart(schema, (r) => ({
  integrationModel: {
    workspace: r.one.workspaceModel({
      from: r.integrationModel.workspaceId,
      to: r.workspaceModel.id,
    }),
    integrationOpenai: r.one.integrationOpenaiModel({
      from: r.integrationModel.id,
      to: r.integrationOpenaiModel.integrationId,
    }),
    integrationGoogleSheet: r.one.integrationGoogleSheetsModel({
      from: r.integrationModel.id,
      to: r.integrationGoogleSheetsModel.integrationId,
    }),
  },
}))
