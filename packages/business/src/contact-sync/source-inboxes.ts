import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import {
  type ContactSyncSourceChannel,
  contactSyncSourceChannels,
  inboxStatuses,
} from "@chatbotx.io/database/partials"
import { inboxModel } from "@chatbotx.io/database/schema"

/** A connected inbox of a channel AhaChat can hold contacts for. */
export type ContactSyncInbox = {
  id: string
  name: string
  channel: ContactSyncSourceChannel
  /** The page's id on the platform (page, IG account, OA, bot). */
  sourceId: string
}

const isSourceChannel = (
  channel: string,
): channel is ContactSyncSourceChannel =>
  contactSyncSourceChannels.safeParse(channel).success

const toSourceInboxes = (
  rows: { id: string; name: string; channel: string; sourceId: string }[],
): ContactSyncInbox[] =>
  rows.flatMap(({ channel, ...row }) =>
    isSourceChannel(channel) ? [{ ...row, channel }] : [],
  )

/** Every connected inbox of the workspace on a channel the sync supports. */
export const listContactSyncInboxes = async (
  workspaceId: string,
): Promise<ContactSyncInbox[]> => {
  const rows = await db
    .select({
      id: inboxModel.id,
      name: inboxModel.name,
      channel: inboxModel.channel,
      sourceId: inboxModel.sourceId,
    })
    .from(inboxModel)
    .where(
      and(
        eq(inboxModel.workspaceId, workspaceId),
        eq(inboxModel.status, inboxStatuses.enum.connected),
        inArray(inboxModel.channel, contactSyncSourceChannels.options),
      ),
    )
    .orderBy(inboxModel.createdAt)
  return toSourceInboxes(rows)
}

/** The given inboxes of the workspace, only those connected and supported. */
export const findContactSyncInboxes = async (
  workspaceId: string,
  inboxIds: string[],
): Promise<ContactSyncInbox[]> => {
  if (inboxIds.length === 0) {
    return []
  }
  const rows = await db
    .select({
      id: inboxModel.id,
      name: inboxModel.name,
      channel: inboxModel.channel,
      sourceId: inboxModel.sourceId,
    })
    .from(inboxModel)
    .where(
      and(
        eq(inboxModel.workspaceId, workspaceId),
        eq(inboxModel.status, inboxStatuses.enum.connected),
        inArray(inboxModel.channel, contactSyncSourceChannels.options),
        inArray(inboxModel.id, inboxIds),
      ),
    )
  return toSourceInboxes(rows)
}
