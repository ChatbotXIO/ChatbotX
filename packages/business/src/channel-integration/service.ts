import { db } from "@chatbotx.io/database/client"
import { adsEligibleChannelTypes } from "@chatbotx.io/utils/channel"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"
import type { ChannelIntegrationChannel } from "./schema"

/**
 * Credential-free view of a connected channel integration. `auth`, CAPI access
 * tokens and every other secret column are deliberately never selected.
 */
export type ChannelIntegrationSummary = {
  id: string
  channel: ChannelIntegrationChannel
  inboxId: string
  name: string
  /** Meta/vendor account id: phone number id, page id, IG id, OA id or open id. */
  externalId: string
  wabaId: string | null
  displayPhoneNumber: string | null
  username: string | null
  coexistEnabled: boolean
  isCoexist: boolean | null
  hasCapiScope: boolean
  datasetId: string | null
  /** Events Manager test code: while set, CAPI events go to Test Events. */
  capiTestEventCode: string | null
  /** User-intent disconnect of the Conversions API. */
  capiDisconnected: boolean
  syncTagEnabledAt: Date | null
  /** WhatsApp/Messenger: flow that runs when a partner hands a conversation back. */
  handoverResumeFlowId: string | null
  tokenRefreshError: string | null
  adsEligible: boolean
}

type ListScope = { workspaceId: string; id?: string }

type ChannelFetcher = (scope: ListScope) => Promise<ChannelIntegrationSummary[]>

const adsEligibleChannels: ReadonlySet<string> = new Set(
  adsEligibleChannelTypes.options,
)

const SUMMARY_DEFAULTS = {
  wabaId: null,
  displayPhoneNumber: null,
  username: null,
  coexistEnabled: false,
  isCoexist: null,
  hasCapiScope: false,
  datasetId: null,
  capiTestEventCode: null,
  capiDisconnected: false,
  syncTagEnabledAt: null,
  handoverResumeFlowId: null,
  tokenRefreshError: null,
} as const

function summarize(
  channel: ChannelIntegrationChannel,
  fields: Pick<
    ChannelIntegrationSummary,
    "id" | "inboxId" | "name" | "externalId"
  > &
    Partial<ChannelIntegrationSummary>,
): ChannelIntegrationSummary {
  return {
    ...SUMMARY_DEFAULTS,
    ...fields,
    channel,
    adsEligible: adsEligibleChannels.has(channel),
  }
}

// One fetcher per channel table. Each lists explicit safe columns only.
const channelFetchers: Record<ChannelIntegrationChannel, ChannelFetcher> = {
  whatsapp: async (scope) => {
    const rows = await db.query.integrationWhatsappModel.findMany({
      where: scope,
      columns: {
        id: true,
        inboxId: true,
        name: true,
        phoneNumberId: true,
        wabaId: true,
        displayPhoneNumber: true,
        coexistEnabled: true,
        isCoexist: true,
        hasCapiScope: true,
        datasetId: true,
        capiTestEventCode: true,
        capiDisconnectedAt: true,
        handoverResumeFlowId: true,
        tokenRefreshError: true,
      },
    })
    return rows.map((row) =>
      summarize("whatsapp", {
        id: row.id,
        inboxId: row.inboxId,
        name: row.name,
        externalId: row.phoneNumberId,
        wabaId: row.wabaId,
        displayPhoneNumber: row.displayPhoneNumber || null,
        coexistEnabled: row.coexistEnabled,
        isCoexist: row.isCoexist,
        hasCapiScope: row.hasCapiScope,
        datasetId: row.datasetId,
        capiTestEventCode: row.capiTestEventCode,
        capiDisconnected: row.capiDisconnectedAt !== null,
        handoverResumeFlowId: row.handoverResumeFlowId,
        tokenRefreshError: row.tokenRefreshError,
      }),
    )
  },
  messenger: async (scope) => {
    const rows = await db.query.integrationMessengerModel.findMany({
      where: scope,
      columns: {
        id: true,
        inboxId: true,
        name: true,
        pageId: true,
        coexistEnabled: true,
        hasCapiScope: true,
        datasetId: true,
        capiTestEventCode: true,
        capiDisconnectedAt: true,
        syncTagEnabledAt: true,
        handoverResumeFlowId: true,
        tokenRefreshError: true,
      },
    })
    return rows.map((row) =>
      summarize("messenger", {
        id: row.id,
        inboxId: row.inboxId,
        name: row.name,
        externalId: row.pageId,
        coexistEnabled: row.coexistEnabled,
        hasCapiScope: row.hasCapiScope,
        datasetId: row.datasetId,
        capiTestEventCode: row.capiTestEventCode,
        capiDisconnected: row.capiDisconnectedAt !== null,
        syncTagEnabledAt: row.syncTagEnabledAt,
        handoverResumeFlowId: row.handoverResumeFlowId,
        tokenRefreshError: row.tokenRefreshError,
      }),
    )
  },
  instagram: async (scope) => {
    const rows = await db.query.integrationInstagramModel.findMany({
      where: scope,
      columns: {
        id: true,
        inboxId: true,
        name: true,
        igId: true,
        username: true,
        coexistEnabled: true,
        hasCapiScope: true,
        datasetId: true,
        capiTestEventCode: true,
        capiDisconnectedAt: true,
        tokenRefreshError: true,
      },
    })
    return rows.map((row) =>
      summarize("instagram", {
        id: row.id,
        inboxId: row.inboxId,
        name: row.name,
        externalId: row.igId,
        username: row.username,
        coexistEnabled: row.coexistEnabled,
        hasCapiScope: row.hasCapiScope,
        datasetId: row.datasetId,
        capiTestEventCode: row.capiTestEventCode,
        capiDisconnected: row.capiDisconnectedAt !== null,
        tokenRefreshError: row.tokenRefreshError,
      }),
    )
  },
  zalo: async (scope) => {
    const rows = await db.query.integrationZaloModel.findMany({
      where: scope,
      columns: {
        id: true,
        inboxId: true,
        name: true,
        oaId: true,
        syncTagEnabledAt: true,
        tokenRefreshError: true,
      },
    })
    return rows.map((row) =>
      summarize("zalo", {
        id: row.id,
        inboxId: row.inboxId,
        name: row.name,
        externalId: row.oaId,
        syncTagEnabledAt: row.syncTagEnabledAt,
        tokenRefreshError: row.tokenRefreshError,
      }),
    )
  },
  tiktok: async (scope) => {
    const rows = await db.query.integrationTiktokModel.findMany({
      where: scope,
      columns: {
        id: true,
        inboxId: true,
        name: true,
        openId: true,
        tokenRefreshError: true,
      },
    })
    return rows.map((row) =>
      summarize("tiktok", {
        id: row.id,
        inboxId: row.inboxId,
        name: row.name,
        externalId: row.openId,
        tokenRefreshError: row.tokenRefreshError,
      }),
    )
  },
}

const allChannels = Object.keys(channelFetchers) as ChannelIntegrationChannel[]

class ChannelIntegrationService extends BaseService {
  /** Connected channel integrations of a workspace, optionally for one channel. */
  async list(props: {
    workspaceId: string
    channel?: ChannelIntegrationChannel
  }): Promise<ChannelIntegrationSummary[]> {
    const channels = props.channel ? [props.channel] : allChannels
    const groups = await Promise.all(
      channels.map((channel) =>
        channelFetchers[channel]({ workspaceId: props.workspaceId }),
      ),
    )
    return groups.flat()
  }

  async get(props: {
    workspaceId: string
    channel: ChannelIntegrationChannel
    id: string
  }): Promise<ChannelIntegrationSummary> {
    const [row] = await channelFetchers[props.channel]({
      workspaceId: props.workspaceId,
      id: props.id,
    })
    if (!row) {
      throw notFoundException("Channel integration not found")
    }
    return row
  }
}

export const channelIntegrationService = new ChannelIntegrationService()
