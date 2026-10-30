import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const oauthConsentRelations = defineRelationsPart(schema, (r) => ({
  oauthConsentModel: {
    client: r.one.oauthApplicationModel({
      from: r.oauthConsentModel.clientId,
      to: r.oauthApplicationModel.clientId,
    }),
    user: r.one.userModel({
      from: r.oauthConsentModel.userId,
      to: r.userModel.id,
    }),
    workspace: r.one.workspaceModel({
      from: r.oauthConsentModel.workspaceId,
      to: r.workspaceModel.id,
    }),
  },
}))
