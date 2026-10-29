import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const oauthAccessTokenRelations = defineRelationsPart(schema, (r) => ({
  oauthAccessTokenModel: {
    client: r.one.oauthApplicationModel({
      from: r.oauthAccessTokenModel.clientId,
      to: r.oauthApplicationModel.clientId,
    }),
    user: r.one.userModel({
      from: r.oauthAccessTokenModel.userId,
      to: r.userModel.id,
    }),
  },
}))
