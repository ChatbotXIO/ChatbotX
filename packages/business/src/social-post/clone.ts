import type { DatabaseClient } from "@chatbotx.io/database/client"
import {
  type SocialMediaInsert,
  socialPostPartRepository,
  socialPostRepository,
} from "@chatbotx.io/database/repositories"
import { createId } from "@chatbotx.io/utils"
import { conflictException, notFoundException } from "../errors"
import { loadPostGraph } from "./post-graph"
import type { CreateSocialPostInput } from "./types"

/** The slot of a recurring post an occurrence is made for, and the template it comes from. */
export type CloneOccurrence = { occurrenceAt: Date; parentSocialPostId: string }

export const CLONE_FAILED_CODE = "duplicateFailed"

/**
 * Copies a post into a new draft inside `tx`: text, link, destinations (with
 * their content type, options and text overrides), shared and per-destination
 * files, and topics. Schedules, results and idempotency keys are not copied.
 * `duplicate` and the recurring-post materialiser both use it, so a copy is the
 * same wherever it comes from. It reads the stored rows (paths, not public
 * URLs), so the copy points at the same files. With `occurrence`, the copy is
 * recorded as that slot of its template (unique per template and instant).
 */
export const cloneSocialPostInTx = async (
  tx: DatabaseClient,
  input: {
    createdById: string | null
    createdVia: CreateSocialPostInput["createdVia"]
    newId: string
    occurrence?: CloneOccurrence
    sourceId: string
    workspaceId: string
  },
): Promise<void> => {
  const { workspaceId, newId, sourceId } = input
  const source = await socialPostRepository.findForWorkspace(
    { id: sourceId, workspaceId },
    tx,
  )
  if (!source) {
    throw notFoundException("Post not found")
  }
  const [graph, topics] = await Promise.all([
    loadPostGraph(tx, { postIds: [sourceId], workspaceId }),
    socialPostRepository.listTopics({ postIds: [sourceId], workspaceId }, tx),
  ])
  const {
    parts: sourceParts,
    postMedia: sharedMedia,
    targetMedia,
    targets,
  } = graph

  const inserted = await socialPostRepository.insertPost(
    {
      createdById: input.createdById,
      createdVia: input.createdVia,
      id: newId,
      idempotencyKey: null,
      idempotencyRequestHash: null,
      linkUrl: source.linkUrl,
      occurrenceAt: input.occurrence?.occurrenceAt,
      parentSocialPostId: input.occurrence?.parentSocialPostId,
      text: source.text,
      workspaceId,
    },
    tx,
  )
  if (!inserted) {
    throw conflictException(
      "The post could not be duplicated",
      CLONE_FAILED_CODE,
    )
  }
  const copyRow = (
    media: Omit<SocialMediaInsert, "id" | "workspaceId">,
  ): SocialMediaInsert => ({ ...media, id: createId(), workspaceId })
  await socialPostRepository.insertPostMedia(
    { rows: sharedMedia.map(copyRow), socialPostId: newId },
    tx,
  )
  for (const target of targets) {
    const targetId = createId()
    await socialPostRepository.insertTargets(
      [
        {
          contentType: target.contentType,
          id: targetId,
          options: target.options,
          overridesMedia: target.overridesMedia,
          provider: target.provider,
          publishDestinationId: target.destinationId,
          scheduleMode: "custom",
          socialPostId: newId,
          textOverride: target.textOverride,
          workspaceId,
        },
      ],
      tx,
    )
    await socialPostRepository.insertTargetMedia(
      {
        rows: targetMedia
          .filter((media) => media.socialPostTargetId === target.id)
          .map(copyRow),
        socialPostTargetId: targetId,
      },
      tx,
    )
    // The follow-ups are copied as text only: every copy starts `pending`.
    await socialPostPartRepository.insertMany(
      sourceParts
        .filter((part) => part.socialPostTargetId === target.id)
        .map((part) => ({
          id: createId(),
          kind: part.kind,
          position: part.position,
          socialPostTargetId: targetId,
          text: part.text,
          workspaceId,
        })),
      tx,
    )
  }
  await socialPostRepository.replaceTopics(
    { postTopicIds: topics.map((topic) => topic.id), socialPostId: newId },
    tx,
  )
}
