import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const inboxTeamMemberRelations = defineRelationsPart(schema, (r) => ({
  inboxTeamMemberModel: {
    inboxTeam: r.one.inboxTeamModel({
      from: r.inboxTeamMemberModel.inboxTeamId,
      to: r.inboxTeamModel.id,
    }),
    user: r.one.userModel({
      from: r.inboxTeamMemberModel.userId,
      to: r.userModel.id,
      optional: false,
    }),
  },
}))
