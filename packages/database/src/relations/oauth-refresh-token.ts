import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const oauthRefreshTokenRelations = defineRelationsPart(schema, (r) => ({
  oauthRefreshTokenModel: {
    client: r.one.oauthClientModel({
      from: r.oauthRefreshTokenModel.clientId,
      to: r.oauthClientModel.clientId,
    }),
    session: r.one.sessionModel({
      from: r.oauthRefreshTokenModel.sessionId,
      to: r.sessionModel.id,
    }),
    user: r.one.userModel({
      from: r.oauthRefreshTokenModel.userId,
      to: r.userModel.id,
    }),
  },
}))
