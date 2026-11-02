import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const mobileRefreshTokenRelations = defineRelationsPart(schema, (r) => ({
  mobileRefreshTokenModel: {
    user: r.one.userModel({
      from: r.mobileRefreshTokenModel.userId,
      to: r.userModel.id,
    }),
  },
}))
