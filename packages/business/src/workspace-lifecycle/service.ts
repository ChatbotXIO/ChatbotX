import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
} from "@chatbotx.io/database/client"
import {
  channelTypes,
  inboxStatuses,
  ROOT_TENANT_ID,
} from "@chatbotx.io/database/partials"
import {
  coexistSyncRunModel,
  inboxModel,
  integrationInstagramModel,
  integrationMessengerModel,
  integrationSmtpModel,
  integrationTelegramModel,
  integrationTiktokModel,
  integrationWebchatModel,
  integrationWhatsappModel,
  integrationZaloModel,
  tagChannelModel,
  whatsappCoexistStagingModel,
} from "@chatbotx.io/database/schema"
import type { InboxWithIntegrations } from "@chatbotx.io/database/types"
import { BaseService } from "../base.service"
import { inboxService } from "../inbox/service"
import { integrationActiveCampaignService } from "../integration-active-campaign/service"
import { integrationDripService } from "../integration-drip/service"
import { integrationGetResponseService } from "../integration-get-response/service"
import { integrationKlaviyoService } from "../integration-klaviyo/service"
import { integrationMailchimpService } from "../integration-mailchimp/service"
import { integrationMailerLiteService } from "../integration-mailer-lite/service"
import { integrationMoosendService } from "../integration-moosend/service"
import { integrationOpenRouterService } from "../integration-openrouter/service"
import { integrationSendGridService } from "../integration-sendgrid/service"
import { logger } from "../logger"
import { userQuotaService } from "../user-quota/service"

type WorkspaceTeardownIntegration = {
  disconnect(auth: unknown): Promise<void>
  isRevokedTokenError?: (error: unknown) => boolean
}

export type WorkspaceTeardownIntegrations = Record<
  string,
  WorkspaceTeardownIntegration | undefined
>

export type WorkspaceTeardownLevel = "pause" | "disconnect"

class WorkspaceLifecycleService extends BaseService {
  async disconnectWorkspaceChannels(props: {
    workspaceId: string
    integrations?: WorkspaceTeardownIntegrations
    teardownLevel?: WorkspaceTeardownLevel
    tx?: DatabaseClient
  }): Promise<number> {
    const { tx = db } = props
    const inboxes = await inboxService.listWithIntegrationsByWorkspace(
      props.workspaceId,
      tx,
    )

    let disconnected = 0
    for (const inbox of inboxes) {
      await this.disconnectWorkspaceInbox({
        inbox,
        integrations: props.integrations,
        teardownLevel: props.teardownLevel ?? "disconnect",
        tx,
      })
      disconnected += 1
    }

    return disconnected
  }

  async disconnectWorkspaceIntegrations(workspaceId: string): Promise<void> {
    const results = await Promise.allSettled([
      integrationActiveCampaignService.disconnect(workspaceId),
      integrationDripService.disconnect(workspaceId),
      integrationGetResponseService.disconnect(workspaceId),
      integrationKlaviyoService.disconnect(workspaceId),
      integrationMailchimpService.disconnect(workspaceId),
      integrationMailerLiteService.disconnect(workspaceId),
      integrationMoosendService.disconnect(workspaceId),
      integrationOpenRouterService.disconnect(workspaceId),
      integrationSendGridService.disconnect(workspaceId),
    ])

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        logger.error(
          {
            err: result.reason,
            workspaceId,
            integrationIndex: index,
          },
          "workspace-teardown: integration cleanup failed",
        )
      }
    })
  }

  async deactivateOwnerWorkspaces(props: {
    ownerId: string
    integrations?: WorkspaceTeardownIntegrations
    teardownLevel?: WorkspaceTeardownLevel
  }): Promise<void> {
    const workspaces = await db.query.workspaceModel.findMany({
      where: { ownerId: props.ownerId },
      columns: { id: true, tenantId: true },
    })

    if (workspaces.length === 0) {
      return
    }

    const teardownLevel = props.teardownLevel ?? "pause"
    for (const workspace of workspaces) {
      await this.disconnectWorkspaceChannels({
        integrations: props.integrations,
        teardownLevel,
        workspaceId: workspace.id,
      })
      if (teardownLevel === "disconnect") {
        await this.disconnectWorkspaceIntegrations(workspace.id)
      }
    }

    await userQuotaService.reconcileOwnerPoolUsage(
      props.ownerId,
      workspaces[0]?.tenantId ?? ROOT_TENANT_ID,
    )
  }

  private async disconnectWorkspaceInbox(props: {
    inbox: InboxWithIntegrations
    integrations?: WorkspaceTeardownIntegrations
    teardownLevel: WorkspaceTeardownLevel
    tx: DatabaseClient
  }): Promise<void> {
    const { inbox, integrations, teardownLevel, tx } = props
    const removeIntegrationRow = teardownLevel === "disconnect"

    const finish = async (disconnect?: WorkspaceTeardownIntegration) => {
      if (disconnect) {
        try {
          await disconnect.disconnect(inboxToAuth(inbox))
        } catch (err) {
          if (!disconnect.isRevokedTokenError?.(err)) {
            logger.error(
              { err, inboxId: inbox.id, workspaceId: inbox.workspaceId },
              "workspace-teardown: provider disconnect failed",
            )
          }
        }
      }

      await tx
        .update(inboxModel)
        .set({ status: inboxStatuses.enum.disconnected })
        .where(eq(inboxModel.id, inbox.id))
    }

    switch (inbox.channel) {
      case channelTypes.enum.messenger: {
        if (removeIntegrationRow && inbox.integrationMessenger) {
          await tx
            .update(coexistSyncRunModel)
            .set({
              status: "failed",
              finishedAt: new Date(),
              currentError: "Integration disconnected",
            })
            .where(
              and(
                eq(
                  coexistSyncRunModel.integrationId,
                  inbox.integrationMessenger.id,
                ),
                inArray(coexistSyncRunModel.status, ["init", "running"]),
              ),
            )
          await tx
            .delete(tagChannelModel)
            .where(
              and(
                eq(tagChannelModel.channelType, channelTypes.enum.messenger),
                eq(
                  tagChannelModel.integrationId,
                  inbox.integrationMessenger.id,
                ),
              ),
            )
          await tx
            .delete(integrationMessengerModel)
            .where(
              eq(integrationMessengerModel.id, inbox.integrationMessenger.id),
            )
        }
        await finish(integrations?.messenger)
        return
      }
      case channelTypes.enum.whatsapp: {
        if (removeIntegrationRow && inbox.integrationWhatsapp) {
          await tx
            .update(coexistSyncRunModel)
            .set({
              status: "failed",
              finishedAt: new Date(),
              currentError: "Integration disconnected",
            })
            .where(
              and(
                eq(
                  coexistSyncRunModel.integrationId,
                  inbox.integrationWhatsapp.id,
                ),
                inArray(coexistSyncRunModel.status, ["init", "running"]),
              ),
            )
          await tx
            .delete(whatsappCoexistStagingModel)
            .where(
              eq(
                whatsappCoexistStagingModel.phoneNumberId,
                inbox.integrationWhatsapp.phoneNumberId,
              ),
            )
          await tx
            .delete(integrationWhatsappModel)
            .where(
              eq(integrationWhatsappModel.id, inbox.integrationWhatsapp.id),
            )
        }
        await finish(integrations?.whatsapp)
        return
      }
      case channelTypes.enum.zalo: {
        if (removeIntegrationRow && inbox.integrationZalo) {
          await tx
            .delete(tagChannelModel)
            .where(
              and(
                eq(tagChannelModel.channelType, channelTypes.enum.zalo),
                eq(tagChannelModel.integrationId, inbox.integrationZalo.id),
              ),
            )
          await tx
            .delete(integrationZaloModel)
            .where(eq(integrationZaloModel.id, inbox.integrationZalo.id))
        }
        await finish(integrations?.zalo)
        return
      }
      case channelTypes.enum.telegram: {
        if (removeIntegrationRow && inbox.integrationTelegram) {
          await tx
            .delete(integrationTelegramModel)
            .where(
              eq(integrationTelegramModel.id, inbox.integrationTelegram.id),
            )
        }
        await finish(integrations?.telegram)
        return
      }
      case channelTypes.enum.instagram: {
        if (removeIntegrationRow && inbox.integrationInstagram) {
          await tx
            .delete(integrationInstagramModel)
            .where(
              eq(integrationInstagramModel.id, inbox.integrationInstagram.id),
            )
        }
        await finish(
          integrations?.[
            inbox.integrationInstagram?.type === "facebook"
              ? "instagramFacebook"
              : "instagram"
          ],
        )
        return
      }
      case channelTypes.enum.tiktok: {
        if (removeIntegrationRow && inbox.integrationTiktok) {
          await tx
            .delete(integrationTiktokModel)
            .where(eq(integrationTiktokModel.id, inbox.integrationTiktok.id))
        }
        await finish(integrations?.tiktok)
        return
      }
      case channelTypes.enum.webchat: {
        if (removeIntegrationRow && inbox.integrationWebchat) {
          await tx
            .delete(integrationWebchatModel)
            .where(eq(integrationWebchatModel.id, inbox.integrationWebchat.id))
        }
        await finish(integrations?.webchat)
        return
      }
      case channelTypes.enum.smtp: {
        if (removeIntegrationRow && inbox.integrationSmtp) {
          await tx
            .delete(integrationSmtpModel)
            .where(eq(integrationSmtpModel.id, inbox.integrationSmtp.id))
        }
        await finish(integrations?.smtp)
        return
      }
      default:
        await finish()
    }
  }
}

const inboxToAuth = (inbox: InboxWithIntegrations): unknown => {
  switch (inbox.channel) {
    case channelTypes.enum.messenger:
      return inbox.integrationMessenger?.auth
    case channelTypes.enum.whatsapp:
      return inbox.integrationWhatsapp?.auth
    case channelTypes.enum.zalo:
      return inbox.integrationZalo?.auth
    case channelTypes.enum.telegram:
      return inbox.integrationTelegram?.auth
    case channelTypes.enum.tiktok:
      return inbox.integrationTiktok?.auth
    case channelTypes.enum.webchat:
      return inbox.integrationWebchat?.auth
    case channelTypes.enum.smtp:
      return inbox.integrationSmtp?.auth
    case channelTypes.enum.instagram:
      return inbox.integrationInstagram?.auth
    default:
      return null
  }
}

export const workspaceLifecycleService = new WorkspaceLifecycleService()
