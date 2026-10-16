import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const leaderboardParticipantRelations = defineRelationsPart(
  schema,
  (r) => ({
    leaderboardParticipantModel: {
      leaderboard: r.one.leaderboardModel({
        from: r.leaderboardParticipantModel.leaderboardId,
        to: r.leaderboardModel.id,
        optional: false,
      }),
      contact: r.one.contactModel({
        from: r.leaderboardParticipantModel.contactId,
        to: r.contactModel.id,
        optional: false,
        alias: "leaderboardParticipant_contact",
      }),
      referrerContact: r.one.contactModel({
        from: r.leaderboardParticipantModel.referrerContactId,
        to: r.contactModel.id,
        alias: "leaderboardParticipant_referrerContact",
      }),
    },
  }),
)
