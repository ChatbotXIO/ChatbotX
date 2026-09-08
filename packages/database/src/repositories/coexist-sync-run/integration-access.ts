import type { CoexistChannel } from "@chatbotx.io/utils/channel"
import { and, type DatabaseClient, eq } from "../../client"
import {
  integrationInstagramModel,
  integrationMessengerModel,
  integrationWhatsappModel,
} from "../../schema"
import type {
  IntegrationInstagramModel,
  IntegrationMessengerModel,
  IntegrationWhatsappModel,
} from "../../types"

/**
 * The per-channel read/write of the coexist flag, as data rather than a
 * switch: `CoexistSyncRunRepository` never names a channel, it looks the
 * channel's accessor up in these two tables. Adding a coexist channel is one
 * entry in each (and the `satisfies Record<CoexistChannel, …>` makes a missing
 * one a compile error).
 */

export type CoexistIntegrationRow =
  | (IntegrationMessengerModel & { channel: "messenger" })
  | (IntegrationInstagramModel & { channel: "instagram" })
  | (IntegrationWhatsappModel & { channel: "whatsapp" })

type IntegrationAccessInput = {
  tx: DatabaseClient
  workspaceId: string
  integrationId: string
}

type IntegrationUpdateInput = IntegrationAccessInput & {
  enabled: boolean
  /** Undefined = leave `coexistAiReadsSyncedHistory` untouched. */
  aiReadsSyncedHistory?: boolean
}

export const integrationLookups = {
  messenger: async ({
    tx,
    workspaceId,
    integrationId,
  }: IntegrationAccessInput): Promise<CoexistIntegrationRow | null> => {
    const row = await tx.query.integrationMessengerModel.findFirst({
      where: { id: integrationId, workspaceId },
    })
    return row ? { ...row, channel: "messenger" } : null
  },
  instagram: async ({
    tx,
    workspaceId,
    integrationId,
  }: IntegrationAccessInput): Promise<CoexistIntegrationRow | null> => {
    // Admit both Instagram types — native login (`type: "instagram"`) and
    // Facebook-linked (`type: "facebook"`). The worker selects the matching
    // coexist adapter by `row.type`.
    const row = await tx.query.integrationInstagramModel.findFirst({
      where: { id: integrationId, workspaceId },
    })
    return row ? { ...row, channel: "instagram" } : null
  },
  whatsapp: async ({
    tx,
    workspaceId,
    integrationId,
  }: IntegrationAccessInput): Promise<CoexistIntegrationRow | null> => {
    const row = await tx.query.integrationWhatsappModel.findFirst({
      where: { id: integrationId, workspaceId },
    })
    return row ? { ...row, channel: "whatsapp" } : null
  },
} satisfies Record<
  CoexistChannel,
  (input: IntegrationAccessInput) => Promise<CoexistIntegrationRow | null>
>

export const integrationUpdates = {
  messenger: async ({
    tx,
    workspaceId,
    integrationId,
    enabled,
    aiReadsSyncedHistory,
  }: IntegrationUpdateInput): Promise<CoexistIntegrationRow | null> => {
    const [row] = await tx
      .update(integrationMessengerModel)
      .set({
        coexistEnabled: enabled,
        ...(aiReadsSyncedHistory === undefined
          ? {}
          : { coexistAiReadsSyncedHistory: aiReadsSyncedHistory }),
      })
      .where(
        and(
          eq(integrationMessengerModel.id, integrationId),
          eq(integrationMessengerModel.workspaceId, workspaceId),
        ),
      )
      .returning()
    return row ? { ...row, channel: "messenger" } : null
  },
  instagram: async ({
    tx,
    workspaceId,
    integrationId,
    enabled,
    aiReadsSyncedHistory,
  }: IntegrationUpdateInput): Promise<CoexistIntegrationRow | null> => {
    const [row] = await tx
      .update(integrationInstagramModel)
      .set({
        coexistEnabled: enabled,
        ...(aiReadsSyncedHistory === undefined
          ? {}
          : { coexistAiReadsSyncedHistory: aiReadsSyncedHistory }),
      })
      .where(
        and(
          eq(integrationInstagramModel.id, integrationId),
          eq(integrationInstagramModel.workspaceId, workspaceId),
        ),
      )
      .returning()
    return row ? { ...row, channel: "instagram" } : null
  },
  whatsapp: async ({
    tx,
    workspaceId,
    integrationId,
    enabled,
    aiReadsSyncedHistory,
  }: IntegrationUpdateInput): Promise<CoexistIntegrationRow | null> => {
    const [row] = await tx
      .update(integrationWhatsappModel)
      .set({
        coexistEnabled: enabled,
        ...(aiReadsSyncedHistory === undefined
          ? {}
          : { coexistAiReadsSyncedHistory: aiReadsSyncedHistory }),
      })
      .where(
        and(
          eq(integrationWhatsappModel.id, integrationId),
          eq(integrationWhatsappModel.workspaceId, workspaceId),
        ),
      )
      .returning()
    return row ? { ...row, channel: "whatsapp" } : null
  },
} satisfies Record<
  CoexistChannel,
  (input: IntegrationUpdateInput) => Promise<CoexistIntegrationRow | null>
>
