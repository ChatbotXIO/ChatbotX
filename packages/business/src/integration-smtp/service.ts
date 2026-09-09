import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { channelTypes } from "@chatbotx.io/database/partials"
import { integrationSmtpModel } from "@chatbotx.io/database/schema"
import type { IntegrationSmtpModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { isSameJsonValue } from "../audit/diff"
import { BaseService } from "../base.service"
import { ChatbotXException } from "../errors"
import { connectChannelIntegration } from "../inbox/connect-channel"
import { inboxService } from "../inbox/service"
import { workspaceService } from "../workspace/service"

/**
 * Mirrors `@chatbotx.io/integration-smtp`'s `SmtpAuthValue` structurally —
 * `packages/business` must not depend on an `integrations/*` package, so the
 * caller (app layer) resolves `provider`'s default host/port via that
 * package's `smtpHostMap` before calling `create`/`update`.
 */
export type SmtpAuthValue = {
  authType: "custom"
  provider: string
  host: string
  port: number
  username: string
  password: string
}

export type CreateSmtpInput = {
  provider: string
  host: string
  port: number
  username: string
  password: string
  fromAddress: string
}

export type UpdateSmtpInput = CreateSmtpInput

class IntegrationSmtpService extends BaseService {
  find({
    where,
  }: {
    where: Partial<{ workspaceId: string; id: string }>
  }): Promise<IntegrationSmtpModel | undefined> {
    return db.query.integrationSmtpModel.findFirst({
      where,
    })
  }

  listByWorkspaceId(workspaceId: string) {
    return db.query.integrationSmtpModel.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    })
  }

  findByIdForWorkspace(props: { id: string; workspaceId: string }) {
    return findOrFail({
      table: integrationSmtpModel,
      where: props,
      message: "SMTP integration not found",
    })
  }

  /**
   * Callers must:
   * 1. verify the SMTP connection (via `verifySmtpConnection` in
   *    `apps/builder/src/features/integration-smtp/services/smtp.service.ts`)
   *    — needs `next-intl` to translate the failure message, which a service
   *    cannot call.
   * 2. resolve `input.host`/`input.port` to the provider's default (via that
   *    same file's `smtpHostMap`) when `input.provider !== "other"` — the
   *    map lives in `@chatbotx.io/integration-smtp`, which `packages/business`
   *    must not depend on.
   */
  async create(
    workspaceId: string,
    input: CreateSmtpInput,
  ): Promise<{ id: string }> {
    const { host, port } = input

    const workspace = await workspaceService.find({
      where: { id: workspaceId },
    })
    if (!workspace) {
      throw new ChatbotXException("Workspace not found")
    }

    const { inbox, wasCreated } = await db.transaction(async (tx) => {
      const smtpId = createId()
      const name = input.username

      return await connectChannelIntegration({
        tx,
        ownerId: workspace.ownerId,
        inboxData: {
          id: smtpId,
          workspaceId,
          channel: channelTypes.enum.smtp,
          name,
          sourceId: smtpId,
        },
        insertIntegration: async (inboxId) => {
          await tx.insert(integrationSmtpModel).values({
            id: smtpId,
            name,
            workspaceId,
            inboxId,
            fromAddress: input.fromAddress,
            auth: {
              authType: "custom" as const,
              provider: input.provider,
              username: input.username,
              password: input.password,
              host,
              port,
            },
          })
        },
      })
    })

    if (wasCreated) {
      await this.audit("connect", `connected a new SMTP channel (#${inbox.id})`)
    }

    return inbox
  }

  async update(
    workspaceId: string,
    id: string,
    input: UpdateSmtpInput,
  ): Promise<IntegrationSmtpModel> {
    const integration = await this.findByIdForWorkspace({ id, workspaceId })
    const currentAuth = integration.auth as SmtpAuthValue
    const provider = input.provider ?? currentAuth.provider
    const host = input.host || currentAuth.host
    const port = input.port || currentAuth.port

    const updatedAuth: SmtpAuthValue = {
      authType: "custom",
      provider,
      host,
      port,
      username: input.username ?? currentAuth.username,
      password: input.password ?? currentAuth.password,
    }

    const name = input.username ?? integration.name
    const fromAddress = input.fromAddress ?? integration.fromAddress

    const updated = await db
      .update(integrationSmtpModel)
      .set({ auth: updatedAuth, name, fromAddress })
      .where(eq(integrationSmtpModel.id, integration.id))
      .returning()
      .then((result) => result[0])

    if (!updated) {
      throw new Error("Failed to update SMTP integration")
    }

    const hasChanged = !isSameJsonValue(
      { auth: updatedAuth, name, fromAddress },
      {
        auth: currentAuth,
        name: integration.name,
        fromAddress: integration.fromAddress,
      },
    )

    if (hasChanged) {
      await this.audit("update", "updated the SMTP channel configuration")
    }

    return updated
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    const [integration, workspace] = await Promise.all([
      this.findByIdForWorkspace({ id, workspaceId }),
      workspaceService.findById({ id: workspaceId }),
    ])

    await db.transaction(async (tx) => {
      await tx
        .delete(integrationSmtpModel)
        .where(eq(integrationSmtpModel.id, integration.id))

      await inboxService.disconnect({
        inboxId: integration.inboxId,
        ownerId: workspace.ownerId,
        workspaceId,
        reason: "manual",
        tx,
      })
    })

    await this.audit(
      "disconnect",
      `disconnected the SMTP channel (#${integration.id})`,
    )
  }
}
export const integrationSmtpService = new IntegrationSmtpService()
