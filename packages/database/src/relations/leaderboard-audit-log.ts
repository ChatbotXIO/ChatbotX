import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const leaderboardAuditLogRelations = defineRelationsPart(
  schema,
  (r) => ({
    leaderboardAuditLogModel: {
      leaderboard: r.one.leaderboardModel({
        from: r.leaderboardAuditLogModel.leaderboardId,
        to: r.leaderboardModel.id,
        optional: false,
      }),
      contact: r.one.contactModel({
        from: r.leaderboardAuditLogModel.contactId,
        to: r.contactModel.id,
        alias: "leaderboardAuditLog_contact",
      }),
      actor: r.one.userModel({
        from: r.leaderboardAuditLogModel.actorUserId,
        to: r.userModel.id,
      }),
    },
  }),
)
