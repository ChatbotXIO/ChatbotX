import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const pollRelations = defineRelationsPart(schema, (r) => ({
  pollModel: {
    workspace: r.one.workspaceModel({
      from: r.pollModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    candidates: r.many.pollCandidateModel({
      from: r.pollModel.id,
      to: r.pollCandidateModel.pollId,
    }),
  },
  pollCandidateModel: {
    poll: r.one.pollModel({
      from: r.pollCandidateModel.pollId,
      to: r.pollModel.id,
      optional: false,
    }),
  },
  pollVoteModel: {
    poll: r.one.pollModel({
      from: r.pollVoteModel.pollId,
      to: r.pollModel.id,
      optional: false,
    }),
    candidate: r.one.pollCandidateModel({
      from: r.pollVoteModel.candidateId,
      to: r.pollCandidateModel.id,
      optional: false,
    }),
  },
}))
