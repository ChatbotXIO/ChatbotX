import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const oauthClientResourceRelations = defineRelationsPart(
  schema,
  (r) => ({
    oauthClientResourceModel: {
      client: r.one.oauthClientModel({
        from: r.oauthClientResourceModel.clientId,
        to: r.oauthClientModel.clientId,
      }),
      resource: r.one.oauthResourceModel({
        from: r.oauthClientResourceModel.resourceId,
        to: r.oauthResourceModel.identifier,
      }),
    },
  }),
)
