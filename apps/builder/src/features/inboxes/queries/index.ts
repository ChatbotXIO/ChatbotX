import {
  type DatabaseClient,
  db,
  relationsFilterToSQL,
} from "@chatbotx.io/database/client"
import { type ChannelType, channelTypes, inboxStatuses } from "@chatbotx.io/database/partials"
import { inboxModel } from "@chatbotx.io/database/schema"
import type { InboxModel } from "@chatbotx.io/database/types"
import { getPaginationWithDefaults } from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListInboxesRequest } from "../schema/action"
import type { InboxResource } from "../schema/resource"

export const inboxService = {
  create: async (props: {
    tx: DatabaseClient
    workspaceId: string
    channel: ChannelType
    sourceId: string
    name: string
  }): Promise<InboxModel> => {
    const [inbox] = await props.tx
      .insert(inboxModel)
      .values({
        id: createId(),
        workspaceId: props.workspaceId,
        channel: props.channel,
        sourceId: props.sourceId,
        name: props.name,
      })
      .returning()
    return inbox
  },

  createOrReconnect: async (props: {
    tx: DatabaseClient
    workspaceId: string
    channel: ChannelType
    sourceId: string
    name: string
  }): Promise<InboxModel> => {
    const [inbox] = await props.tx
      .insert(inboxModel)
      .values({
        id: createId(),
        workspaceId: props.workspaceId,
        channel: props.channel,
        sourceId: props.sourceId,
        name: props.name,
      })
      .onConflictDoUpdate({
        target: [inboxModel.channel, inboxModel.sourceId],
        set: { status: inboxStatuses.enum.connected },
      })
      .returning()
    return inbox
  },
}

export async function listInboxes(
  input: ListInboxesRequest,
): Promise<PaginatedResponse<InboxResource>> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const where  = {
    workspaceId: input.workspaceId,
    status: inboxStatuses.enum.connected,
    channel: {
      ne: channelTypes.enum.smtp,
    }
  }

  const pagination = getPaginationWithDefaults(input)
  const [data, totalRows] = await Promise.all([
    db.query.inboxModel.findMany({
      ...pagination,
      where,
      with: input.includes?.includes("integration")
        ? {
            integrationWhatsapp: true,
            integrationWebchat: true,
            integrationMessenger: true,
            integrationInstagram: true,
            integrationZalo: true,
            integrationTelegram: true,
          }
        : undefined,
    }),
    db.$count(inboxModel, relationsFilterToSQL(inboxModel, where)),
  ])

  const pageCount = Math.ceil(totalRows / pagination.limit)

  return { data, pageCount }
}
