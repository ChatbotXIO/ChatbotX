import type { DatabaseClient } from "@chatbotx.io/database/client"
import {
  socialPostPartRepository,
  socialPostRepository,
} from "@chatbotx.io/database/repositories"

/**
 * A post's stored children: its destinations, shared files, each overriding
 * destination's own files, and follow-up parts. Batched reads for any number of
 * posts, all scoped to the workspace. Callers that also need topics read them
 * separately.
 */
export const loadPostGraph = async (
  tx: DatabaseClient | undefined,
  input: { postIds: string[]; workspaceId: string },
) => {
  const { postIds, workspaceId } = input
  const [targets, postMedia] = await Promise.all([
    socialPostRepository.listTargets({ postIds, workspaceId }, tx),
    socialPostRepository.listPostMedia({ postIds, workspaceId }, tx),
  ])
  const [targetMedia, parts] = await Promise.all([
    socialPostRepository.listTargetMedia(
      {
        targetIds: targets
          .filter((target) => target.overridesMedia)
          .map((target) => target.id),
        workspaceId,
      },
      tx,
    ),
    socialPostPartRepository.listForTargets(
      { targetIds: targets.map((target) => target.id), workspaceId },
      tx,
    ),
  ])
  return { parts, postMedia, targetMedia, targets }
}
