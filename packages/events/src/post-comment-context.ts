import { isPostCommentEventType } from "@chatbotx.io/database/partials"
import { z } from "zod"

/**
 * The part of a post-comment event that identifies its comment: enough for a
 * run to read the post and the stored comment back when it renders
 * `{{post.*}}` / `{{comment.*}}`.
 */
export const postCommentRefSchema = z.object({
  channelPostId: z.string().min(1),
  commentMessageId: z.string().min(1),
  commentMessageCreatedAt: z.iso.datetime(),
})
export type PostCommentRef = z.infer<typeof postCommentRefSchema>

/** The comment a post-comment event is about; undefined for any other event or a malformed bag. */
export const extractPostCommentRef = (
  eventType: string,
  eventData: Record<string, unknown> | undefined,
): PostCommentRef | undefined => {
  if (!isPostCommentEventType(eventType)) {
    return
  }
  const parsed = postCommentRefSchema.safeParse(eventData)
  return parsed.success ? parsed.data : undefined
}
