import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const invitationRelations = defineRelationsPart(schema, (r) => ({
  invitationModel: {
    workspace: r.one.workspaceModel({
      from: r.invitationModel.workspaceId,
      to: r.workspaceModel.id,
    }),
    user: r.one.userModel({
      from: r.invitationModel.invitedBy,
      to: r.userModel.id,
    }),
    organization: r.one.organizationModel({
      from: r.invitationModel.organizationId,
      to: r.organizationModel.id,
    }),
  },
}))
