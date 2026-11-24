import type { ConversationParticipantPreview } from "@chatbotx.io/business"
import type { ConversationParticipantResource } from "../schema/resource"

/**
 * Flat, public-friendly participants. A row without its member or reply time
 * (nothing to show) is skipped; the FK and the non-null read filter make that
 * unreachable in practice.
 */
export const mapConversationParticipants = (
  participants: readonly ConversationParticipantPreview[],
): ConversationParticipantResource[] =>
  participants.flatMap(({ userId, lastRepliedAt, user }) =>
    user && lastRepliedAt
      ? [
          {
            userId,
            name: user.name,
            image: user.image,
            lastRepliedAt,
          },
        ]
      : [],
  )
