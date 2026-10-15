import { and, db, eq } from "@chatbotx.io/database/client"
import { miniAppPublicationModel } from "@chatbotx.io/database/schema"
import type { MiniAppPublicationModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"

/** One Mini App on one WhatsApp number. */
type PublicationKey = { miniAppId: string; integrationWhatsappId: string }

class MiniAppPublicationService extends BaseService {
  async findForIntegration(
    key: PublicationKey,
  ): Promise<MiniAppPublicationModel | null> {
    return (
      (await db.query.miniAppPublicationModel.findFirst({
        where: {
          miniAppId: key.miniAppId,
          integrationWhatsappId: key.integrationWhatsappId,
        },
      })) ?? null
    )
  }

  /** Every WhatsApp publication of the workspace's given Mini Apps. */
  async listForMiniApps(input: {
    workspaceId: string
    miniAppIds: string[]
  }): Promise<MiniAppPublicationModel[]> {
    if (input.miniAppIds.length === 0) {
      return []
    }
    return await db.query.miniAppPublicationModel.findMany({
      where: {
        miniAppId: { in: input.miniAppIds },
        miniApp: { workspaceId: input.workspaceId },
      },
    })
  }

  /** Forgets a publication once its Flow is gone from Meta. */
  async remove(key: PublicationKey): Promise<void> {
    await db
      .delete(miniAppPublicationModel)
      .where(
        and(
          eq(miniAppPublicationModel.miniAppId, key.miniAppId),
          eq(
            miniAppPublicationModel.integrationWhatsappId,
            key.integrationWhatsappId,
          ),
        ),
      )
  }

  /** Saves the outcome of a publish attempt (one row per Mini App + number). */
  async record(
    input: PublicationKey & {
      whatsappFlowId: string | null
      sourceId: string
      status: string
      validationErrors: unknown[]
      published: boolean
    },
  ): Promise<MiniAppPublicationModel> {
    const values = {
      whatsappFlowId: input.whatsappFlowId,
      sourceId: input.sourceId,
      status: input.status,
      validationErrors: input.validationErrors,
      ...(input.published ? { publishedAt: new Date() } : {}),
    }
    const [row] = await db
      .insert(miniAppPublicationModel)
      .values({
        id: createId(),
        miniAppId: input.miniAppId,
        integrationWhatsappId: input.integrationWhatsappId,
        ...values,
      })
      .onConflictDoUpdate({
        target: [
          miniAppPublicationModel.miniAppId,
          miniAppPublicationModel.integrationWhatsappId,
        ],
        set: values,
      })
      .returning()
    return row as MiniAppPublicationModel
  }
}

export const miniAppPublicationService = new MiniAppPublicationService()
