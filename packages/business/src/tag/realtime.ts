import {
  CONTACT_TAGS_CHANGED_MAX_CONTACT_IDS,
  RealtimeEventType,
} from "@chatbotx.io/realtime-protocol"
import { queueWorkspaceRealtimeEvent } from "../platform/realtime-broadcast"

/**
 * Tells every open inbox that these contacts' tags changed so each client can
 * refresh the tag preview of the rows it has loaded. Call after the write has
 * committed, with only the contacts whose links actually changed. Ids are
 * de-duplicated and split into events of at most
 * `CONTACT_TAGS_CHANGED_MAX_CONTACT_IDS`. Best effort: a Redis failure is
 * logged by `queueWorkspaceRealtimeEvent` and never reaches the write.
 */
export const publishContactTagsChanged = async (props: {
  contactIds: readonly string[]
  workspaceId: string
}): Promise<void> => {
  const contactIds = [...new Set(props.contactIds)]
  const events: Promise<void>[] = []
  for (
    let offset = 0;
    offset < contactIds.length;
    offset += CONTACT_TAGS_CHANGED_MAX_CONTACT_IDS
  ) {
    events.push(
      queueWorkspaceRealtimeEvent(props.workspaceId, {
        eventType: RealtimeEventType.contactTagsChanged,
        data: {
          contactIds: contactIds.slice(
            offset,
            offset + CONTACT_TAGS_CHANGED_MAX_CONTACT_IDS,
          ),
        },
      }),
    )
  }
  await Promise.all(events)
}
