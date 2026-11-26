import { and, db, eq } from "@chatbotx.io/database/client"
import { pollCandidateModel, pollModel } from "@chatbotx.io/database/schema"
import { pollService } from "../../poll/service"
import { createLinkRewritePatcher } from "./link-rewrite-patcher"
import {
  createFlowRefPatcher,
  dependenciesOn,
  makeCollector,
  recordCopy,
  scopedWhere,
  updateNotSupported,
} from "./shared"
import {
  resolveToolImageUrl,
  stageToolImages,
  type ToolImageSlot,
} from "./staging"
import type {
  PatchTask,
  ResourceAdapter,
  StagedObject,
  TemplateInstallContext,
  TemplateStageContext,
} from "./types"

type TemplatePollCandidateEntry = {
  name: string
  description: string | null
  imageUrl: string | null
}

type TemplatePollEntry = {
  sourceId: string
  name: string
  imageUrl: string
  startsAt: string
  endsAt: string
  /** A `resources.flows` sourceId; polls install before flows, so it is patched afterwards. */
  afterVoteFlowId: string | null
  candidates: TemplatePollCandidateEntry[]
}

/** The poll's stored free text: what a link to a later-installed tool can sit in. */
type PollText = {
  name: string
  candidates: { name: string; description: string | null }[]
}

/** The `PollCandidate` and `Poll` columns the adapter does not write: votes are history, ids are new. */
const POLL_IMAGE_SKIPPED = "pollImage"

const pollImageSlots = (entry: TemplatePollEntry): ToolImageSlot[] => [
  { stageKey: `polls:${entry.sourceId}:cover`, url: entry.imageUrl },
  ...entry.candidates.flatMap((candidate, index) =>
    candidate.imageUrl
      ? [
          {
            stageKey: `polls:${entry.sourceId}:candidate:${index}`,
            url: candidate.imageUrl,
          },
        ]
      : [],
  ),
]

/**
 * What a template does with every column of `Poll`. Votes are a separate table and never travel.
 */
export const POLL_COLUMNS = {
  id: "reset",
  createdAt: "reset",
  updatedAt: "reset",
  workspaceId: "reset",
  name: "copy",
  // Staged into the installer's storage.
  imageUrl: "copy",
  // Copied as shipped; an expired window warns.
  startsAt: "copy",
  endsAt: "copy",
  // Written once flows exist.
  afterVoteFlowId: "reference",
} as const satisfies Record<
  keyof typeof pollModel.$inferSelect,
  "copy" | "reset" | "drop" | "rebind" | "reference"
>

/**
 * What a template does with every column of `PollCandidate` (copied with its poll).
 */
export const POLL_CANDIDATE_COLUMNS = {
  id: "reset",
  createdAt: "reset",
  updatedAt: "reset",
  workspaceId: "reset",
  // The new poll's id.
  pollId: "rebind",
  position: "copy",
  name: "copy",
  description: "copy",
  // Staged into the installer's storage.
  imageUrl: "copy",
} as const satisfies Record<
  keyof typeof pollCandidateModel.$inferSelect,
  "copy" | "reset" | "drop" | "rebind" | "reference"
>

/**
 * A poll is copied with its candidates and none of its votes. The after-vote
 * flow is patched once flows exist. Dates are copied as shipped; a poll whose
 * end already passed installs as is, with a warning, since it can take no vote
 * until the installer moves its dates. Images in the publishing workspace's
 * storage are copied at stage time, like questionnaire images.
 */
export const pollsAdapter: ResourceAdapter<TemplatePollEntry> = {
  category: "polls",
  providesKinds: ["poll"],
  consumesKinds: ["flow"],
  deferredKinds: ["flow"],
  trackedKind: "poll",
  folderTypes: [],
  // A candidate's text can link to a tool installed after the polls.
  rewritesLinksInPatch: true,
  minFormatVersion: 3,
  sync: updateNotSupported("polls"),

  async stage(
    ctx: TemplateStageContext,
    entries: readonly TemplatePollEntry[],
  ): Promise<Map<string, StagedObject>> {
    return await stageToolImages(
      ctx,
      entries.flatMap(pollImageSlots),
      POLL_IMAGE_SKIPPED,
    )
  },

  async insert(
    ctx: TemplateInstallContext,
    entries: readonly TemplatePollEntry[],
  ): Promise<PatchTask[]> {
    const flowRefs = createFlowRefPatcher("polls")
    const linkPatcher = createLinkRewritePatcher<PollText>("polls")
    for (const entry of entries) {
      const startsAt = new Date(entry.startsAt)
      const endsAt = new Date(entry.endsAt)
      const imageOf = (slot: ToolImageSlot, path: string): string =>
        resolveToolImageUrl(ctx, {
          ...slot,
          category: "polls",
          skippedKind: POLL_IMAGE_SKIPPED,
          path,
        })
      const [coverSlot] = pollImageSlots(entry)
      const created = await pollService.insertInTx(ctx.tx, {
        workspaceId: ctx.workspaceId,
        name: entry.name,
        imageUrl: imageOf(coverSlot, `polls.${entry.sourceId}.imageUrl`),
        startsAt,
        endsAt,
        afterVoteFlowId: null,
        candidates: entry.candidates.map((candidate, index) => ({
          name: candidate.name,
          description: candidate.description,
          imageUrl: candidate.imageUrl
            ? imageOf(
                {
                  stageKey: `polls:${entry.sourceId}:candidate:${index}`,
                  url: candidate.imageUrl,
                },
                `polls.${entry.sourceId}.candidates.${index}.imageUrl`,
              )
            : null,
        })),
      })
      if (endsAt <= new Date()) {
        ctx.warn({
          category: "polls",
          entityKind: "scheduleExpired",
          path: `polls.${entry.sourceId}.endsAt`,
          value: entry.endsAt,
        })
      }
      recordCopy(ctx, {
        category: "polls",
        resourceKind: "poll",
        idMapKind: "poll",
        sourceId: entry.sourceId,
        resourceId: created.id,
      })
      const text: PollText = {
        name: entry.name,
        candidates: entry.candidates.map(({ name, description }) => ({
          name,
          description,
        })),
      }
      linkPatcher.defer({
        sourceId: entry.sourceId,
        original: text,
        write: async (tx, linked, patchCtx) => {
          await tx
            .update(pollModel)
            .set({ name: linked.name })
            .where(
              and(
                eq(pollModel.id, created.id),
                eq(pollModel.workspaceId, patchCtx.workspaceId),
              ),
            )
          // Candidates come back in position order, like the shipped list.
          for (const [index, candidate] of created.candidates.entries()) {
            await tx
              .update(pollCandidateModel)
              .set({
                name: linked.candidates[index].name,
                description: linked.candidates[index].description,
              })
              .where(
                and(
                  eq(pollCandidateModel.id, candidate.id),
                  eq(pollCandidateModel.workspaceId, patchCtx.workspaceId),
                ),
              )
          }
        },
      })
      flowRefs.defer({
        sourceEntryId: entry.sourceId,
        field: "afterVoteFlowId",
        sourceFlowId: entry.afterVoteFlowId,
        write: async (tx, afterVoteFlowId) => {
          await tx
            .update(pollModel)
            .set({ afterVoteFlowId })
            .where(eq(pollModel.id, created.id))
        },
      })
    }
    return [...linkPatcher.tasks(), ...flowRefs.tasks()]
  },

  collector: makeCollector({
    findIds: (query) =>
      db.query.pollModel.findMany({
        where: scopedWhere(query),
        columns: { id: true },
        limit: query.limit,
      }),

    async collectRows(workspaceId, ids) {
      const rows = await db.query.pollModel.findMany({
        where: scopedWhere({ workspaceId, ids }),
      })
      const candidates = await db.query.pollCandidateModel.findMany({
        where: { workspaceId, pollId: { in: rows.map((row) => row.id) } },
        orderBy: { position: "asc" },
      })
      const candidatesByPoll = Map.groupBy(
        candidates,
        (candidate) => candidate.pollId,
      )
      return {
        entries: rows.map((row) => ({
          sourceId: row.id,
          name: row.name,
          imageUrl: row.imageUrl,
          startsAt: row.startsAt.toISOString(),
          endsAt: row.endsAt.toISOString(),
          afterVoteFlowId: row.afterVoteFlowId,
          candidates: (candidatesByPoll.get(row.id) ?? []).map((candidate) => ({
            name: candidate.name,
            description: candidate.description,
            imageUrl: candidate.imageUrl,
          })),
        })),
        hardDependencies: dependenciesOn(
          "flows",
          rows.map((row) => row.afterVoteFlowId),
        ),
      }
    },
  }),
}
