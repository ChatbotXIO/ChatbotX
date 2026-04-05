import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const organizationMemberRelations = defineRelationsPart(schema, (r) => ({
  organizationMemberModel: {
    organization: r.one.organizationModel({
      from: r.organizationMemberModel.organizationId,
      to: r.organizationModel.id,
      optional: false,
    }),
    user: r.one.userModel({
      from: r.organizationMemberModel.userId,
      to: r.userModel.id,
      optional: false,
    }),
  },
}))
