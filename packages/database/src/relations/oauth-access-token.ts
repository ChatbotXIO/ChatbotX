import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const oauthAccessTokenRelations = defineRelationsPart(schema, (r) => ({
  oauthAccessTokenModel: {
    client: r.one.oauthClientModel({
      from: r.oauthAccessTokenModel.clientId,
      to: r.oauthClientModel.clientId,
    }),
    refreshToken: r.one.oauthRefreshTokenModel({
      from: r.oauthAccessTokenModel.refreshId,
      to: r.oauthRefreshTokenModel.id,
    }),
    session: r.one.sessionModel({
      from: r.oauthAccessTokenModel.sessionId,
      to: r.sessionModel.id,
    }),
    user: r.one.userModel({
      from: r.oauthAccessTokenModel.userId,
      to: r.userModel.id,
    }),
  },
}))
