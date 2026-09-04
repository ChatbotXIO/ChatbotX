import type {
  BotMessageAIProviderStats,
  BotMessageStats,
  ContactCountsSchema,
  ContactsByDimension,
  ConversationArchivedStats,
  ConversationAssignedByAdminStats,
  ConversationAssignedStats,
  ConversationFollowUpStats,
  ConversationHandoffStats,
  HumanAgentStats,
  ListFlowNodeContactsResponse,
  MessagesByAdminStats,
  MessagesBySenderStats,
  RefLinkTimeseriesRow,
  UniqueConversationsByAdminStats,
} from "@chatbotx.io/analytics"
import { ORPCError } from "@orpc/client"
import { endOfToday, startOfToday, subDays } from "date-fns"
import { createStore } from "zustand/vanilla"
import type { AnalyticsApi } from "./analytics-api-context"

const REFLINK_CONTACTS_PER_PAGE = 10

export type AnalysisDashboardType = "dashboard" | "reflinks" | "magic-links"

export type AnalysisState = {
  api: AnalyticsApi
  type: AnalysisDashboardType
  loading: boolean
  errors: Map<string, string>

  // `linkId`/`timezone` are only guaranteed by the reflink/magic-link
  // dashboards (see `ReflinkAnalytics`/`MagicLinkAnalytics`); named here as
  // optional so `getRefLinkStats` et al. can assert their presence at the
  // point of use instead of losing type safety through the index signature.
  defaultSearchParams: {
    workspaceId: string
    linkId?: string
    timezone?: string
    [x: string]: string | undefined
  }
  from: Date
  to: Date

  // stats
  contactCounts: ContactCountsSchema[]
  newContactCounts: ContactCountsSchema[]
  blockedContactCounts: ContactCountsSchema[]
  inboxTotalContacts: number
  inboxNewContacts: number
  inboxActiveContacts: number
  inboxBlockedContacts: number
  botMessagesByResult: BotMessageStats[]
  botMessagesAIProviders: BotMessageAIProviderStats[]
  messagesBySender: MessagesBySenderStats[]
  contactsByChannel: ContactsByDimension[]
  contactsByCountry: ContactsByDimension[]
  contactsBySource: ContactsByDimension[]
  conversationHandoffs: ConversationHandoffStats[]
  conversationFollowUps: ConversationFollowUpStats[]
  conversationArchived: ConversationArchivedStats[]
  conversationAssigned: ConversationAssignedStats[]
  conversationAssignedByAdmin: ConversationAssignedByAdminStats[]
  uniqueConversationsByAdmin: UniqueConversationsByAdminStats[]
  messagesByAdmin: MessagesByAdminStats[]
  botMessagesWithResponse: BotMessageStats[]
  botMessagesNoResponse: BotMessageStats[]
  humanAgentStats: HumanAgentStats[]

  // reflink stats
  refLinkStats: RefLinkTimeseriesRow[]
  reflinkContacts: ListFlowNodeContactsResponse["data"]
  reflinkContactsPage: number
  reflinkContactsPageCount: number

  // magic-link stats
  magicLinkStats: RefLinkTimeseriesRow[]
  magicLinkContacts: ListFlowNodeContactsResponse["data"]
  magicLinkContactsPage: number
  magicLinkContactsPageCount: number
}

export type AnalysisActions = {
  handleError: (action: string, error: unknown) => void
  initialize: () => Promise<void>
  setRange: (props: { from: Date; to: Date }) => Promise<void>
  loadAnalysisData: () => Promise<void>

  getContactCounts: () => Promise<void>
  getNewContactCounts: () => Promise<void>
  getBlockedContactCounts: () => Promise<void>
  getInboxTotalContacts: () => Promise<void>
  getInboxNewContacts: () => Promise<void>
  getInboxActiveContacts: () => Promise<void>
  getInboxBlockedContacts: () => Promise<void>
  getBotMessagesByResult: () => Promise<void>
  getBotMessagesAIProviders: () => Promise<void>
  getMessagesBySender: () => Promise<void>
  getContactsByChannel: () => Promise<void>
  getContactsByCountry: () => Promise<void>
  getContactsBySource: () => Promise<void>
  getConversationHandoffs: () => Promise<void>
  getConversationFollowUps: () => Promise<void>
  getConversationArchived: () => Promise<void>
  getConversationAssigned: () => Promise<void>
  getConversationAssignedByAdmin: () => Promise<void>
  getUniqueConversationsByAdmin: () => Promise<void>
  getMessagesByAdmin: () => Promise<void>
  getBotMessagesWithResponse: () => Promise<void>
  getBotMessagesNoResponse: () => Promise<void>
  getHumanAgentStats: () => Promise<void>

  getRefLinkStats: () => Promise<void>
  getReflinkContacts: () => Promise<void>
  setReflinkContactsPage: (page: number) => Promise<void>

  getMagicLinkStats: () => Promise<void>
  getMagicLinkContacts: () => Promise<void>
  setMagicLinkContactsPage: (page: number) => Promise<void>
}

export type AnalysisStore = AnalysisState & AnalysisActions

export const createAnalysisStore = (
  props: Partial<AnalysisState> & {
    api: AnalyticsApi
    defaultSearchParams: AnalysisState["defaultSearchParams"]
  },
) =>
  createStore<AnalysisStore>((set, get) => ({
    type: "dashboard",
    loading: false,
    errors: new Map<string, string>(),

    // Default option is last 7 days
    from: subDays(startOfToday(), 7),
    to: endOfToday(),
    ...props,

    // Default stats
    contactCounts: [],
    newContactCounts: [],
    blockedContactCounts: [],
    inboxTotalContacts: 0,
    inboxNewContacts: 0,
    inboxActiveContacts: 0,
    inboxBlockedContacts: 0,
    botMessagesByResult: [],
    botMessagesAIProviders: [],
    messagesBySender: [],
    contactsByChannel: [],
    contactsByCountry: [],
    contactsBySource: [],
    conversationHandoffs: [],
    conversationFollowUps: [],
    conversationArchived: [],
    conversationAssigned: [],
    conversationAssignedByAdmin: [],
    uniqueConversationsByAdmin: [],
    messagesByAdmin: [],
    botMessagesWithResponse: [],
    botMessagesNoResponse: [],
    humanAgentStats: [],

    // Default reflink stats
    refLinkStats: [],
    reflinkContacts: [],
    reflinkContactsPage: 1,
    reflinkContactsPageCount: 0,

    // Default magic-link stats
    magicLinkStats: [],
    magicLinkContacts: [],
    magicLinkContactsPage: 1,
    magicLinkContactsPageCount: 0,

    initialize: async () => {
      const { loadAnalysisData } = get()
      await loadAnalysisData()
    },

    handleError: (action: string, error: unknown) => {
      const { errors } = get()
      if (error instanceof ORPCError) {
        set({ errors: errors.set(action, error.message) })
      } else {
        set({
          errors: errors.set(
            action,
            "An unexpected error occurred. Please contact admin",
          ),
        })
      }
    },

    loadAnalysisData: async () => {
      const { type } = get()

      if (type === "reflinks") {
        const { getRefLinkStats, getReflinkContacts } = get()
        set({ loading: true, errors: new Map<string, string>() })
        await Promise.all([getRefLinkStats(), getReflinkContacts()])
        set({ loading: false })
        return
      }

      if (type === "magic-links") {
        const { getMagicLinkStats, getMagicLinkContacts } = get()
        set({ loading: true, errors: new Map<string, string>() })
        await Promise.all([getMagicLinkStats(), getMagicLinkContacts()])
        set({ loading: false })
        return
      }

      const {
        getContactCounts,
        getNewContactCounts,
        getBlockedContactCounts,
        getInboxTotalContacts,
        getInboxNewContacts,
        getInboxActiveContacts,
        getInboxBlockedContacts,
        getBotMessagesByResult,
        getBotMessagesAIProviders,
        getMessagesBySender,
        getContactsByChannel,
        getContactsByCountry,
        getContactsBySource,
        getConversationHandoffs,
        getConversationFollowUps,
        getConversationArchived,
        getConversationAssigned,
        getConversationAssignedByAdmin,
        getUniqueConversationsByAdmin,
        getMessagesByAdmin,
        getBotMessagesWithResponse,
        getBotMessagesNoResponse,
        getHumanAgentStats,
      } = get()
      set({ loading: true, errors: new Map<string, string>() })

      await Promise.all([
        getContactCounts(),
        getNewContactCounts(),
        getBlockedContactCounts(),
        getInboxTotalContacts(),
        getInboxNewContacts(),
        getInboxActiveContacts(),
        getInboxBlockedContacts(),
        getBotMessagesByResult(),
        getBotMessagesAIProviders(),
        getMessagesBySender(),
        getContactsByChannel(),
        getContactsByCountry(),
        getContactsBySource(),
        getConversationHandoffs(),
        getConversationFollowUps(),
        getConversationArchived(),
        getConversationAssigned(),
        getConversationAssignedByAdmin(),
        getUniqueConversationsByAdmin(),
        getMessagesByAdmin(),
        getBotMessagesWithResponse(),
        getBotMessagesNoResponse(),
        getHumanAgentStats(),
      ])
      set({ loading: false })
    },

    setRange: async (props: { from: Date; to: Date }) => {
      set(props)

      const { loadAnalysisData } = get()
      await loadAnalysisData()
    },

    getContactCounts: async () => {
      const { api, defaultSearchParams, from, to } = get()

      try {
        const { data: contactCounts } =
          await api.contactCountsPerDayAnalyticsAPI({
            ...defaultSearchParams,
            from: from.toISOString(),
            to: to.toISOString(),
          })

        set({ contactCounts })
      } catch (error: unknown) {
        get().handleError("getContactCounts", error)
      }
    },

    getNewContactCounts: async () => {
      const { api, defaultSearchParams, from, to } = get()

      try {
        const { data: newContactCounts } =
          await api.newContactCountsPerDayAnalyticsAPI({
            ...defaultSearchParams,
            from: from.toISOString(),
            to: to.toISOString(),
          })

        set({ newContactCounts })
      } catch (error: unknown) {
        get().handleError("getNewContactCounts", error)
      }
    },

    getBlockedContactCounts: async () => {
      const { api, defaultSearchParams, from, to } = get()

      try {
        const { data: blockedContactCounts } =
          await api.blockedContactsPerDayAnalyticsAPI({
            ...defaultSearchParams,
            from: from.toISOString(),
            to: to.toISOString(),
          })

        set({ blockedContactCounts })
      } catch (error: unknown) {
        get().handleError("getBlockedContactCounts", error)
      }
    },

    getInboxBlockedContacts: async () => {
      const { api, defaultSearchParams, from, to } = get()

      try {
        const result = await api.blockedContactsCountAnalyticsAPI({
          ...defaultSearchParams,
          from: from.toISOString(),
          to: to.toISOString(),
        })

        set({ inboxBlockedContacts: result.data.count })
      } catch (error: unknown) {
        get().handleError("getInboxBlockedContacts", error)
        set({ inboxBlockedContacts: 0 })
      }
    },

    getInboxTotalContacts: async () => {
      const { api, defaultSearchParams, from, to } = get()

      try {
        const result = await api.contactsCountAnalyticsAPI({
          ...defaultSearchParams,
          from: from.toISOString(),
          to: to.toISOString(),
        })

        set({ inboxTotalContacts: result.data.count })
      } catch (error: unknown) {
        get().handleError("getInboxTotalContacts", error)
        set({ inboxTotalContacts: 0 })
      }
    },

    getInboxNewContacts: async () => {
      const { api, defaultSearchParams, from, to } = get()

      try {
        const result = await api.newContactsCountAnalyticsAPI({
          ...defaultSearchParams,
          from: from.toISOString(),
          to: to.toISOString(),
        })

        set({ inboxNewContacts: result.data.count })
      } catch (error: unknown) {
        get().handleError("getInboxNewContacts", error)
        set({ inboxNewContacts: 0 })
      }
    },

    getInboxActiveContacts: async () => {
      const { api, defaultSearchParams, from, to } = get()

      try {
        const result = await api.activeContactsCountAnalyticsAPI({
          ...defaultSearchParams,
          from: from.toISOString(),
          to: to.toISOString(),
        })

        set({ inboxActiveContacts: result.data.count })
      } catch (error: unknown) {
        get().handleError("getInboxActiveContacts", error)
        set({ inboxActiveContacts: 0 })
      }
    },

    getBotMessagesByResult: async () => {
      const { api, defaultSearchParams, from, to } = get()

      try {
        const { data: botMessagesByResult } =
          await api.botMessagesByResultAnalyticsAPI({
            ...defaultSearchParams,
            from: from.toISOString(),
            to: to.toISOString(),
            granularity: "day",
          })

        set({ botMessagesByResult })
      } catch (error: unknown) {
        get().handleError("getBotMessagesByResult", error)
      }
    },

    getBotMessagesAIProviders: async () => {
      const { api, defaultSearchParams, from, to } = get()

      try {
        const result = await api.botMessagesAIProvidersAnalyticsAPI({
          ...defaultSearchParams,
          from: from.toISOString(),
          to: to.toISOString(),
        })

        set({ botMessagesAIProviders: result.data })
      } catch (error: unknown) {
        get().handleError("getBotMessagesAIProviders", error)
      }
    },

    getMessagesBySender: async () => {
      const { api, defaultSearchParams, from, to } = get()
      try {
        const result = await api.messagesBySenderAnalyticsAPI({
          ...defaultSearchParams,
          from: from.toISOString(),
          to: to.toISOString(),
        })

        set({ messagesBySender: result.data })
      } catch (error: unknown) {
        get().handleError("getMessagesBySender", error)
      }
    },

    getContactsByChannel: async () => {
      const { api, defaultSearchParams, from, to } = get()

      try {
        const result = await api.contactsByDimensionAnalyticsAPI({
          ...defaultSearchParams,
          from: from.toISOString(),
          to: to.toISOString(),
          dimension: "channel",
        })

        set({ contactsByChannel: result.data })
      } catch (error: unknown) {
        get().handleError("getContactsByChannel", error)
      }
    },

    getContactsByCountry: async () => {
      const { api, defaultSearchParams, from, to } = get()

      try {
        const result = await api.contactsByDimensionAnalyticsAPI({
          ...defaultSearchParams,
          from: from.toISOString(),
          to: to.toISOString(),
          dimension: "country",
        })

        set({ contactsByCountry: result.data })
      } catch (error: unknown) {
        get().handleError("getContactsByCountry", error)
      }
    },

    getContactsBySource: async () => {
      const { api, defaultSearchParams, from, to } = get()

      try {
        const result = await api.contactsByDimensionAnalyticsAPI({
          ...defaultSearchParams,
          from: from.toISOString(),
          to: to.toISOString(),
          dimension: "source",
        })

        set({ contactsBySource: result.data })
      } catch (error: unknown) {
        get().handleError("getContactsBySource", error)
      }
    },

    getConversationHandoffs: async () => {
      const { api, defaultSearchParams, from, to } = get()

      try {
        const result = await api.conversationHandoffsAnalyticsAPI({
          ...defaultSearchParams,
          from: from.toISOString(),
          to: to.toISOString(),
        })

        set({ conversationHandoffs: result.data })
      } catch (error: unknown) {
        get().handleError("getConversationHandoffs", error)
      }
    },

    getConversationFollowUps: async () => {
      const { api, defaultSearchParams, from, to } = get()

      try {
        const result = await api.conversationFollowUpsAnalyticsAPI({
          ...defaultSearchParams,
          from: from.toISOString(),
          to: to.toISOString(),
        })

        set({ conversationFollowUps: result.data })
      } catch (error: unknown) {
        get().handleError("getConversationFollowUps", error)
      }
    },

    getConversationArchived: async () => {
      const { api, defaultSearchParams, from, to } = get()

      try {
        const result = await api.conversationArchivedAnalyticsAPI({
          ...defaultSearchParams,
          from: from.toISOString(),
          to: to.toISOString(),
        })

        set({ conversationArchived: result.data })
      } catch (error: unknown) {
        get().handleError("getConversationArchived", error)
      }
    },

    getConversationAssigned: async () => {
      const { api, defaultSearchParams, from, to } = get()

      try {
        const result = await api.conversationAssignedAnalyticsAPI({
          ...defaultSearchParams,
          from: from.toISOString(),
          to: to.toISOString(),
        })

        set({ conversationAssigned: result.data })
      } catch (error: unknown) {
        get().handleError("getConversationAssigned", error)
      }
    },

    getConversationAssignedByAdmin: async () => {
      const { api, defaultSearchParams, from, to } = get()

      try {
        const result = await api.conversationAssignedByAdminAnalyticsAPI({
          ...defaultSearchParams,
          from: from.toISOString(),
          to: to.toISOString(),
        })

        set({ conversationAssignedByAdmin: result.data })
      } catch (error: unknown) {
        get().handleError("getConversationAssignedByAdmin", error)
      }
    },

    getUniqueConversationsByAdmin: async () => {
      const { api, defaultSearchParams, from, to } = get()

      try {
        const result = await api.uniqueConversationsByAdminAnalyticsAPI({
          ...defaultSearchParams,
          from: from.toISOString(),
          to: to.toISOString(),
        })

        set({ uniqueConversationsByAdmin: result.data })
      } catch (error: unknown) {
        get().handleError("getUniqueConversationsByAdmin", error)
      }
    },

    getMessagesByAdmin: async () => {
      const { api, defaultSearchParams, from, to } = get()

      try {
        const result = await api.messagesByAdminAnalyticsAPI({
          ...defaultSearchParams,
          from: from.toISOString(),
          to: to.toISOString(),
        })

        set({ messagesByAdmin: result.data })
      } catch (error: unknown) {
        get().handleError("getMessagesByAdmin", error)
      }
    },

    getBotMessagesWithResponse: async () => {
      const { api, defaultSearchParams, from, to } = get()

      try {
        const { data: botMessagesWithResponse } =
          await api.botMessagesWithResponseAnalyticsAPI({
            ...defaultSearchParams,
            from: from.toISOString(),
            to: to.toISOString(),
            granularity: "day",
          })

        set({ botMessagesWithResponse })
      } catch (error: unknown) {
        get().handleError("getBotMessagesWithResponse", error)
      }
    },

    getBotMessagesNoResponse: async () => {
      const { api, defaultSearchParams, from, to } = get()

      try {
        const { data: botMessagesNoResponse } =
          await api.botMessagesNoResponseAnalyticsAPI({
            ...defaultSearchParams,
            from: from.toISOString(),
            to: to.toISOString(),
            granularity: "day",
          })

        set({ botMessagesNoResponse })
      } catch (error: unknown) {
        get().handleError("getBotMessagesNoResponse", error)
      }
    },

    getHumanAgentStats: async () => {
      const { api, defaultSearchParams, from, to } = get()

      try {
        const { data: humanAgentStats } = await api.humanAgentStatsAnalyticsAPI(
          {
            ...defaultSearchParams,
            from: from.toISOString(),
            to: to.toISOString(),
          },
        )

        set({ humanAgentStats })
      } catch (error: unknown) {
        get().handleError("getHumanAgentStats", error)
      }
    },

    // `linkId`/`timezone` are only present in `defaultSearchParams` when the
    // reflink dashboard mounted the store (see `ReflinkAnalytics`), the only
    // place these two actions are wired up — the `!` reflects that runtime
    // contract, which the shared `defaultSearchParams` type can't express.
    getRefLinkStats: async () => {
      const { api, defaultSearchParams, from, to } = get()

      try {
        const { data: refLinkStats } = await api.refLinkStats({
          ...defaultSearchParams,
          linkId: defaultSearchParams.linkId as string,
          timezone: defaultSearchParams.timezone as string,
          startDate: from.toISOString(),
          endDate: to.toISOString(),
        })

        set({ refLinkStats })
      } catch (error: unknown) {
        get().handleError("getRefLinkStats", error)
      }
    },

    getReflinkContacts: async () => {
      const { api, defaultSearchParams, reflinkContactsPage, from, to } = get()

      try {
        const result = await api.refLinkContacts({
          ...defaultSearchParams,
          linkId: defaultSearchParams.linkId as string,
          page: reflinkContactsPage,
          perPage: REFLINK_CONTACTS_PER_PAGE,
          startDate: from.toISOString(),
          endDate: to.toISOString(),
        })

        set({
          reflinkContacts: result.data,
          reflinkContactsPageCount: result.pageCount,
        })
      } catch (error: unknown) {
        get().handleError("getReflinkContacts", error)
      }
    },

    setReflinkContactsPage: async (page: number) => {
      set({ reflinkContactsPage: page })

      const { getReflinkContacts } = get()
      await getReflinkContacts()
    },

    // `linkId`/`timezone` are only present in `defaultSearchParams` when the
    // magic-link dashboard mounted the store (see `MagicLinkAnalytics`), the
    // only place these two actions are wired up — the `!` reflects that
    // runtime contract, which the shared `defaultSearchParams` type can't
    // express.
    getMagicLinkStats: async () => {
      const { api, defaultSearchParams, from, to } = get()

      try {
        const { data: magicLinkStats } = await api.magicLinkStats({
          ...defaultSearchParams,
          linkId: defaultSearchParams.linkId as string,
          timezone: defaultSearchParams.timezone as string,
          startDate: from.toISOString(),
          endDate: to.toISOString(),
        })

        set({ magicLinkStats })
      } catch (error: unknown) {
        get().handleError("getMagicLinkStats", error)
      }
    },

    getMagicLinkContacts: async () => {
      const { api, defaultSearchParams, magicLinkContactsPage, from, to } =
        get()

      try {
        const result = await api.magicLinkContacts({
          ...defaultSearchParams,
          linkId: defaultSearchParams.linkId as string,
          page: magicLinkContactsPage,
          perPage: REFLINK_CONTACTS_PER_PAGE,
          startDate: from.toISOString(),
          endDate: to.toISOString(),
        })

        set({
          magicLinkContacts: result.data,
          magicLinkContactsPageCount: result.pageCount,
        })
      } catch (error: unknown) {
        get().handleError("getMagicLinkContacts", error)
      }
    },

    setMagicLinkContactsPage: async (page: number) => {
      set({ magicLinkContactsPage: page })

      const { getMagicLinkContacts } = get()
      await getMagicLinkContacts()
    },
  }))
