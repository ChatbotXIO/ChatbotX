import { inArray } from "drizzle-orm"
import type { DatabaseClient } from "../../client"
import { attachmentModel, messageModel } from "../../schema"
import type { AttachmentModel } from "../../types"
import {
  type AnyDatabaseClient,
  type AttachmentTable,
  BaseMessageRepository,
  type MessageTable,
} from "./base-message-repository"
import type { CreateAttachmentInput } from "./message-repository.interface"

export class MessageRepository extends BaseMessageRepository {
  private readonly db: DatabaseClient

  constructor(db: DatabaseClient) {
    super()
    this.db = db
  }

  protected getMessageModel(): MessageTable {
    return messageModel
  }

  protected getAttachmentModel(): AttachmentTable {
    return attachmentModel
  }

  protected getDbForWrite(): AnyDatabaseClient {
    return this.db
  }

  protected getDbForRead(): AnyDatabaseClient {
    return this.db
  }

  protected createAttachmentValues(
    attachments: Omit<
      CreateAttachmentInput,
      "messageId" | "messageCreatedAt"
    >[],
    messageId: string,
    _messageCreatedAt: Date,
  ): (typeof attachmentModel.$inferInsert)[] {
    return attachments.map((attachment) => ({
      ...attachment,
      messageId,
    }))
  }

  protected async queryAttachmentsForMessages(
    db: AnyDatabaseClient,
    messageIds: string[],
    _messageCreatedAts?: Date[],
  ): Promise<AttachmentModel[]> {
    if (messageIds.length === 0) {
      return []
    }

    const attachments = await db
      .select()
      .from(attachmentModel)
      .where(inArray(attachmentModel.messageId, messageIds))

    return attachments as AttachmentModel[]
  }
}
