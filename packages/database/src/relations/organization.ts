import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const organizationRelations = defineRelationsPart(schema, (r) => ({
  organizationModel: {
    workspaces: r.many.workspaceModel({
      from: r.organizationModel.id,
      to: r.workspaceModel.organizationId,
    }),
    invitations: r.many.invitationModel({
      from: r.organizationModel.id,
      to: r.invitationModel.organizationId,
    }),
    users: r.many.userModel({
      from: r.organizationModel.id.through(
        r.organizationMemberModel.organizationId,
      ),
      to: r.userModel.id.through(r.organizationMemberModel.userId),
    }),
    organizationMembers: r.many.organizationMemberModel({
      from: r.organizationModel.id,
      to: r.organizationMemberModel.organizationId,
    }),
    credentials: r.many.organizationCredentialModel({
      from: r.organizationModel.id,
      to: r.organizationCredentialModel.organizationId,
    }),
  },
}))
