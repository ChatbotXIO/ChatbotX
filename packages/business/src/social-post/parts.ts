import type { SocialPartInsert } from "@chatbotx.io/database/repositories"
import { createId } from "@chatbotx.io/utils"
import type { PartInput } from "@chatbotx.io/utils/post-publishing"
import type { SocialPostTargetInput } from "./types"

/**
 * The follow-ups of a target in publish order: thread parts as given, the first
 * comment last. The index in this list is `partIndex` in an issue; the stored
 * `position` is that index plus one (the head is the target itself).
 */
export const orderedParts = (
  target: Pick<SocialPostTargetInput, "firstComment" | "parts">,
): PartInput[] => {
  const threadParts: PartInput[] = (target.parts ?? []).map((part) => ({
    kind: "threadPart",
    text: part.text,
  }))
  const comment: PartInput[] = target.firstComment
    ? [{ kind: "firstComment", text: target.firstComment.text }]
    : []
  return [...threadParts, ...comment]
}

/** Rows for a target's follow-ups, ids fresh, positions 1..N. */
export const partInserts = (input: {
  parts: readonly PartInput[]
  socialPostTargetId: string
  workspaceId: string
}): SocialPartInsert[] =>
  input.parts.map((part, index) => ({
    id: createId(),
    kind: part.kind,
    position: index + 1,
    socialPostTargetId: input.socialPostTargetId,
    text: part.text,
    workspaceId: input.workspaceId,
  }))
