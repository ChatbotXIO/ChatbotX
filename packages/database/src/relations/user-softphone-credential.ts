import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const userSoftphoneCredentialRelations = defineRelationsPart(
  schema,
  (r) => ({
    userSoftphoneCredentialModel: {
      workspace: r.one.workspaceModel({
        from: r.userSoftphoneCredentialModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
      user: r.one.userModel({
        from: r.userSoftphoneCredentialModel.userId,
        to: r.userModel.id,
        optional: false,
      }),
    },
  }),
)
