import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const platformCredentialRelations = defineRelationsPart(schema, (r) => ({
  platformCredentialModel: {
    user: r.one.userModel({
      from: r.platformCredentialModel.userId,
      to: r.userModel.id,
    }),
  },
}))
