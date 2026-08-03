import { db, eq, sql } from "@chatbotx.io/database/client"
import { igStoryAutomationModel } from "@chatbotx.io/database/schema"
import { BaseService } from "../base.service"

class IgStoryAutomationService extends BaseService {
  findActiveAutomations(props: {
    workspaceId: string
    channelType: "instagram" | "instagramFacebook"
  }) {
    return db.query.igStoryAutomationModel.findMany({
      where: {
        workspaceId: props.workspaceId,
        isActive: true,
        type: props.channelType,
      },
    })
  }

  async incrementRepliesCount(automationId: string) {
    await db
      .update(igStoryAutomationModel)
      .set({
        repliesCount: sql`${igStoryAutomationModel.repliesCount} + 1`,
      })
      .where(eq(igStoryAutomationModel.id, automationId))
  }
}

export const igStoryAutomationService = new IgStoryAutomationService()
