import {
  and,
  asc,
  db,
  desc,
  eq,
  gt,
  inArray,
  type SQL,
} from "@chatbotx.io/database/client"
import {
  type ChannelType,
  requiresRecentInteractionWindow,
} from "@chatbotx.io/database/partials"
import {
  buildContactInboxContactFilterSQL,
  contactInboxInteractedWithin24hSQL,
} from "@chatbotx.io/database/queries"
import { broadcastModel, contactInboxModel } from "@chatbotx.io/database/schema"
import { chunkById } from "@chatbotx.io/database/utils"
import { BaseService } from "../base.service"
import { inboxService } from "../inbox/service"
import type { BroadcastAudienceInput } from "./schema"

const DEFAULT_CHUNK_SIZE = 1000
const OPTION_LIST_LIMIT = 500

type ContactInboxRow = typeof contactInboxModel.$inferSelect
type SelectOptionRow = { id: string; name: string }

class BroadcastService extends BaseService {
  async listOptions(input: {
    workspaceId: string
    channel: ChannelType
  }): Promise<SelectOptionRow[]> {
    return await db
      .select({
        id: broadcastModel.id,
        name: broadcastModel.name,
      })
      .from(broadcastModel)
      .where(
        and(
          eq(broadcastModel.workspaceId, input.workspaceId),
          eq(broadcastModel.channel, input.channel),
        ),
      )
      .orderBy(desc(broadcastModel.createdAt))
      .limit(OPTION_LIST_LIMIT)
  }

  private buildAudienceWhere(
    inboxIds: string[],
    input: BroadcastAudienceInput,
  ): SQL | undefined {
    return and(
      inArray(contactInboxModel.inboxId, inboxIds),
      input.contactFilter
        ? buildContactInboxContactFilterSQL({
            contactIdColumn: contactInboxModel.contactId,
            workspaceId: input.workspaceId,
            contactFilter: input.contactFilter,
          })
        : undefined,
      requiresRecentInteractionWindow(input.subaction)
        ? contactInboxInteractedWithin24hSQL()
        : undefined,
    )
  }

  private resolveInboxIds(input: BroadcastAudienceInput): Promise<string[]> {
    return inboxService.resolveBroadcastInboxIds({
      workspaceId: input.workspaceId,
      channels: input.channels,
      integrationWhatsappId: input.integrationWhatsappId,
      integrationMessengerId: input.integrationMessengerId,
    })
  }

  async countAudience(input: BroadcastAudienceInput): Promise<number> {
    const inboxIds = await this.resolveInboxIds(input)
    if (inboxIds.length === 0) {
      return 0
    }

    return db.$count(
      contactInboxModel,
      this.buildAudienceWhere(inboxIds, input),
    )
  }

  async forEachAudienceChunk(
    input: BroadcastAudienceInput & { chunkSize?: number },
    onChunk: (rows: ContactInboxRow[]) => Promise<boolean | undefined>,
  ): Promise<void> {
    const inboxIds = await this.resolveInboxIds(input)
    if (inboxIds.length === 0) {
      return
    }

    const where = this.buildAudienceWhere(inboxIds, input)
    const chunkSize = input.chunkSize ?? DEFAULT_CHUNK_SIZE

    await chunkById<ContactInboxRow>(
      (lastId) =>
        db
          .select()
          .from(contactInboxModel)
          .where(
            and(where, lastId ? gt(contactInboxModel.id, lastId) : undefined),
          )
          .orderBy(asc(contactInboxModel.id))
          .limit(chunkSize),
      { chunkSize, callback: onChunk },
    )
  }
}

export const broadcastService = new BroadcastService()
