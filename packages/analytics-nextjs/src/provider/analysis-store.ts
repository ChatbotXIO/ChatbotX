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
  GetBotMessagesAIProvidersResponseSchema,
  GetContactCountsResponseSchema,
  GetContactsByDimensionStatsResponseSchema,
  GetContactsCountResponseSchema,
  GetConversationArchivedResponse,
  GetConversationAssignedByAdminResponse,
  GetConversationAssignedResponse,
  GetConversationFollowUpsResponse,
  GetConversationHandoffsResponse,
  GetHumanAgentStatsResponseSchema,
  GetMessagesByAdminStatsResponseSchema,
  GetMessagesBySenderStatsResponseSchema,
  GetMessagesStatsResponseSchema,
  GetUniqueConversationsByAdminResponse,
  HumanAgentStats,
  ListFlowNodeContactsResponse,
  MessagesByAdminStats,
  MessagesBySenderStats,
  RefLinkTimeseriesRow,
  UniqueConversationsByAdminStats,
} from "@chatbotx.io/analytics"
import { endOfToday, startOfToday, subDays } from "date-fns"
import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"

const REFLINK_CONTACTS_PER_PAGE = 10

export type AnalysisDashboardType = "dashboard" | "reflinks" | "magic-links"

export type AnalysisState = {
  type: AnalysisDashboardType
  loading: boolean
  errors: Map<string, string>

  defaultSearchParams: { [x: string]: string }
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

export const createAnalysisStore = (props: Partial<AnalysisState>) =>
  createStore<AnalysisStore>((set, get) => ({
    type: "dashboard",
    loading: false,
    errors: new Map<string, string>(),

    // Default option is last 7 days
    defaultSearchParams: {},
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
      if (error instanceof HTTPError) {
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
      const { defaultSearchParams, from, to } = get()

      try {
        const { data: contactCounts } = await ky
          .get("/api/analytics/contact-counts-per-day", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          })
          .json<GetContactCountsResponseSchema>()

        set({ contactCounts })
      } catch (error: unknown) {
        get().handleError("getContactCounts", error)
      }
    },

    getNewContactCounts: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const { data: newContactCounts } = await ky
          .get("/api/analytics/new-contact-counts-per-day", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          })
          .json<GetContactCountsResponseSchema>()

        set({ newContactCounts })
      } catch (error: unknown) {
        get().handleError("getNewContactCounts", error)
      }
    },

    getBlockedContactCounts: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const { data: blockedContactCounts } = await ky
          .get("/api/analytics/blocked-contacts-per-day", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          })
          .json<GetContactCountsResponseSchema>()

        set({ blockedContactCounts })
      } catch (error: unknown) {
        get().handleError("getBlockedContactCounts", error)
      }
    },

    getInboxBlockedContacts: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const result = await ky
          .get("/api/analytics/blocked-contacts-count", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          })
          .json<GetContactsCountResponseSchema>()

        set({ inboxBlockedContacts: result.data.count })
      } catch (error: unknown) {
        get().handleError("getInboxBlockedContacts", error)
        set({ inboxBlockedContacts: 0 })
      }
    },

    getInboxTotalContacts: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const result = await ky
          .get("/api/analytics/contacts-count", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          })
          .json<GetContactsCountResponseSchema>()

        set({ inboxTotalContacts: result.data.count })
      } catch (error: unknown) {
        get().handleError("getInboxTotalContacts", error)
        set({ inboxTotalContacts: 0 })
      }
    },

    getInboxNewContacts: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const result = await ky
          .get("/api/analytics/new-contacts-count", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          })
          .json<GetContactsCountResponseSchema>()

        set({ inboxNewContacts: result.data.count })
      } catch (error: unknown) {
        get().handleError("getInboxNewContacts", error)
        set({ inboxNewContacts: 0 })
      }
    },

    getInboxActiveContacts: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const result = await ky
          .get("/api/analytics/active-contacts-count", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          })
          .json<GetContactsCountResponseSchema>()

        set({ inboxActiveContacts: result.data.count })
      } catch (error: unknown) {
        get().handleError("getInboxActiveContacts", error)
        set({ inboxActiveContacts: 0 })
      }
    },

    getBotMessagesByResult: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const { data: botMessagesByResult } = await ky
          .get("/api/analytics/bot-messages-by-result", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
              granularity: "day",
            },
          })
          .json<GetMessagesStatsResponseSchema>()

        set({ botMessagesByResult })
      } catch (error: unknown) {
        get().handleError("getBotMessagesByResult", error)
      }
    },

    getBotMessagesAIProviders: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const result = await ky
          .get("/api/analytics/bot-messages-ai-providers", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          })
          .json<GetBotMessagesAIProvidersResponseSchema>()

        set({ botMessagesAIProviders: result.data })
      } catch (error: unknown) {
        get().handleError("getBotMessagesAIProviders", error)
      }
    },

    getMessagesBySender: async () => {
      const { defaultSearchParams, from, to } = get()
      try {
        const result = await ky
          .get("/api/analytics/messages-by-sender", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          })
          .json<GetMessagesBySenderStatsResponseSchema>()

        set({ messagesBySender: result.data })
      } catch (error: unknown) {
        get().handleError("getMessagesBySender", error)
      }
    },

    getContactsByChannel: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const result = await ky
          .get("/api/analytics/contacts-by-dimension", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
              dimension: "channel",
            },
          })
          .json<GetContactsByDimensionStatsResponseSchema>()

        set({ contactsByChannel: result.data })
      } catch (error: unknown) {
        get().handleError("getContactsByChannel", error)
      }
    },

    getContactsByCountry: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const result = await ky
          .get("/api/analytics/contacts-by-dimension", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
              dimension: "country",
            },
          })
          .json<GetContactsByDimensionStatsResponseSchema>()

        set({ contactsByCountry: result.data })
      } catch (error: unknown) {
        get().handleError("getContactsByCountry", error)
      }
    },

    getContactsBySource: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const result = await ky
          .get("/api/analytics/contacts-by-dimension", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
              dimension: "source",
            },
          })
          .json<GetContactsByDimensionStatsResponseSchema>()

        set({ contactsBySource: result.data })
      } catch (error: unknown) {
        get().handleError("getContactsBySource", error)
      }
    },

    getConversationHandoffs: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const result = await ky
          .get("/api/analytics/conversation-handoffs", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          })
          .json<GetConversationHandoffsResponse>()

        set({ conversationHandoffs: result.data })
      } catch (error: unknown) {
        get().handleError("getConversationHandoffs", error)
      }
    },

    getConversationFollowUps: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const result = await ky
          .get("/api/analytics/conversation-followups", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          })
          .json<GetConversationFollowUpsResponse>()

        set({ conversationFollowUps: result.data })
      } catch (error: unknown) {
        get().handleError("getConversationFollowUps", error)
      }
    },

    getConversationArchived: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const result = await ky
          .get("/api/analytics/conversation-archived", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          })
          .json<GetConversationArchivedResponse>()

        set({ conversationArchived: result.data })
      } catch (error: unknown) {
        get().handleError("getConversationArchived", error)
      }
    },

    getConversationAssigned: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const result = await ky
          .get("/api/analytics/conversation-assigned", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          })
          .json<GetConversationAssignedResponse>()

        set({ conversationAssigned: result.data })
      } catch (error: unknown) {
        get().handleError("getConversationAssigned", error)
      }
    },

    getConversationAssignedByAdmin: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const result = await ky
          .get("/api/analytics/conversation-assigned-by-admin", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          })
          .json<GetConversationAssignedByAdminResponse>()

        set({ conversationAssignedByAdmin: result.data })
      } catch (error: unknown) {
        get().handleError("getConversationAssignedByAdmin", error)
      }
    },

    getUniqueConversationsByAdmin: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const result = await ky
          .get("/api/analytics/unique-conversations-by-admin", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          })
          .json<GetUniqueConversationsByAdminResponse>()

        set({ uniqueConversationsByAdmin: result.data })
      } catch (error: unknown) {
        get().handleError("getUniqueConversationsByAdmin", error)
      }
    },

    getMessagesByAdmin: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const result = await ky
          .get("/api/analytics/messages-by-admin", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          })
          .json<GetMessagesByAdminStatsResponseSchema>()

        set({ messagesByAdmin: result.data })
      } catch (error: unknown) {
        get().handleError("getMessagesByAdmin", error)
      }
    },

    getBotMessagesWithResponse: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const { data: botMessagesWithResponse } = await ky
          .get("/api/analytics/bot-messages-with-response", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
              granularity: "day",
            },
          })
          .json<GetMessagesStatsResponseSchema>()

        set({ botMessagesWithResponse })
      } catch (error: unknown) {
        get().handleError("getBotMessagesWithResponse", error)
      }
    },

    getBotMessagesNoResponse: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const { data: botMessagesNoResponse } = await ky
          .get("/api/analytics/bot-messages-no-response", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
              granularity: "day",
            },
          })
          .json<GetMessagesStatsResponseSchema>()

        set({ botMessagesNoResponse })
      } catch (error: unknown) {
        get().handleError("getBotMessagesNoResponse", error)
      }
    },

    getHumanAgentStats: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const { data: humanAgentStats } = await ky
          .get("/api/analytics/human-agent-stats", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          })
          .json<GetHumanAgentStatsResponseSchema>()

        set({ humanAgentStats })
      } catch (error: unknown) {
        get().handleError("getHumanAgentStats", error)
      }
    },

    getRefLinkStats: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const { data: refLinkStats } = await ky
          .get("/api/analytics/ref-links-stats", {
            searchParams: {
              ...defaultSearchParams,
              startDate: from.toISOString(),
              endDate: to.toISOString(),
            },
          })
          .json<{ data: RefLinkTimeseriesRow[] }>()

        set({ refLinkStats })
      } catch (error: unknown) {
        get().handleError("getRefLinkStats", error)
      }
    },

    getReflinkContacts: async () => {
      const { defaultSearchParams, reflinkContactsPage, from, to } = get()

      try {
        const result = await ky
          .get("/api/analytics/ref-links-contacts", {
            searchParams: {
              ...defaultSearchParams,
              page: reflinkContactsPage,
              perPage: REFLINK_CONTACTS_PER_PAGE,
              startDate: from.toISOString(),
              endDate: to.toISOString(),
            },
          })
          .json<ListFlowNodeContactsResponse>()

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

    getMagicLinkStats: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const { data: magicLinkStats } = await ky
          .get("/api/analytics/magic-links-stats", {
            searchParams: {
              ...defaultSearchParams,
              startDate: from.toISOString(),
              endDate: to.toISOString(),
            },
          })
          .json<{ data: RefLinkTimeseriesRow[] }>()

        set({ magicLinkStats })
      } catch (error: unknown) {
        get().handleError("getMagicLinkStats", error)
      }
    },

    getMagicLinkContacts: async () => {
      const { defaultSearchParams, magicLinkContactsPage, from, to } = get()

      try {
        const result = await ky
          .get("/api/analytics/magic-links-contacts", {
            searchParams: {
              ...defaultSearchParams,
              page: magicLinkContactsPage,
              perPage: REFLINK_CONTACTS_PER_PAGE,
              startDate: from.toISOString(),
              endDate: to.toISOString(),
            },
          })
          .json<ListFlowNodeContactsResponse>()

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
