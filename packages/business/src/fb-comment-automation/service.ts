import { db, eq, sql } from "@chatbotx.io/database/client"
import {
  contactInboxModel,
  fbCommentAutomationModel,
  fbCommentAutomationReplyModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { formatInTimeZone } from "date-fns-tz"
import { BaseService } from "../base.service"

class FbCommentAutomationService extends BaseService {
  findActiveAutomations(props: {
    workspaceId: string
    channelType: "messenger" | "instagram"
  }) {
    return db.query.fbCommentAutomationModel.findMany({
      where: {
        workspaceId: props.workspaceId,
        isActive: true,
        type: props.channelType,
      },
    })
  }

  isWithinSchedule(
    automation: { startTime: string | null; endTime: string | null },
    timezone: string,
  ): boolean {
    const { startTime, endTime } = automation
    if (!(startTime && endTime)) {
      return true
    }
    const currentTime = formatInTimeZone(new Date(), timezone, "HH:mm")

    if (startTime <= endTime) {
      return currentTime >= startTime && currentTime <= endTime
    }
    // Overnight window (endTime is earlier than startTime, e.g. 22:00-06:00).
    return currentTime >= startTime || currentTime <= endTime
  }

  getPriorContactInboxCount(props: { contactId: string }) {
    return db.$count(
      contactInboxModel,
      eq(contactInboxModel.contactId, props.contactId),
    )
  }

  findDedup(props: {
    automationId: string
    contactId: string
    postId: string
  }) {
    return db.query.fbCommentAutomationReplyModel.findFirst({
      where: {
        automationId: props.automationId,
        contactId: props.contactId,
        postId: props.postId,
      },
    })
  }

  async insertDedup(props: {
    automationId: string
    contactId: string
    postId: string
    workspaceId: string
  }) {
    await db
      .insert(fbCommentAutomationReplyModel)
      .values({ id: createId(), ...props })
      .onConflictDoNothing()
  }

  async incrementRepliesCount(automationId: string) {
    await db
      .update(fbCommentAutomationModel)
      .set({
        repliesCount: sql`${fbCommentAutomationModel.repliesCount} + 1`,
      })
      .where(eq(fbCommentAutomationModel.id, automationId))
  }
}

export const fbCommentAutomationService = new FbCommentAutomationService()
