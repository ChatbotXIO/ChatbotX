import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const leaderboardRelations = defineRelationsPart(schema, (r) => ({
  leaderboardModel: {
    workspace: r.one.workspaceModel({
      from: r.leaderboardModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    inbox: r.one.inboxModel({
      from: r.leaderboardModel.inboxId,
      to: r.inboxModel.id,
    }),
    minigame: r.one.minigameModel({
      from: r.leaderboardModel.minigameId,
      to: r.minigameModel.id,
    }),
    referralWelcomeFlow: r.one.flowModel({
      from: r.leaderboardModel.referralWelcomeFlowId,
      to: r.flowModel.id,
    }),
    participants: r.many.leaderboardParticipantModel({
      from: r.leaderboardModel.id,
      to: r.leaderboardParticipantModel.leaderboardId,
    }),
  },
}))
