import type {
  BotMessageAIProviderStats,
  BotMessageStats,
  ContactCountsSchema,
  ContactsByDimension,
  ConversationHandoffStats,
  GetBotMessagesAIProvidersResponseSchema,
  GetContactCountsResponseSchema,
  GetContactsByDimensionStatsResponseSchema,
  GetContactsCountResponseSchema,
  GetConversationHandoffsResponse,
  GetMessagesBySenderStatsResponseSchema,
  GetMessagesStatsResponseSchema,
  MessagesBySenderStats,
} from "@chatbotx.io/analytics"
import { endOfToday, startOfToday, subDays } from "date-fns"
import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"

export type AnalysisState = {
  loading: boolean
  errors: Map<string, string>

  defaultSearchParams: { [x: string]: string }
  from: Date
  to: Date

  // stats
  contactCounts: ContactCountsSchema[]
  newContactCounts: ContactCountsSchema[]
  inboxTotalContacts: number
  inboxNewContacts: number
  inboxActiveContacts: number
  botMessagesByResult: BotMessageStats[]
  botMessagesAIProviders: BotMessageAIProviderStats[]
  messagesBySender: MessagesBySenderStats[]
  contactsByChannel: ContactsByDimension[]
  contactsByCountry: ContactsByDimension[]
  contactsBySource: ContactsByDimension[]
  conversationHandoffs: ConversationHandoffStats[]
  botMessagesWithResponse: BotMessageStats[]
  botMessagesNoResponse: BotMessageStats[]
}

export type AnalysisActions = {
  handleError: (action: string, error: unknown) => void
  initialize: () => Promise<void>
  setRange: (props: { from: Date; to: Date }) => Promise<void>
  loadAnalysisData: () => Promise<void>

  getContactCounts: () => Promise<void>
  getNewContactCounts: () => Promise<void>
  getInboxTotalContacts: () => Promise<void>
  getInboxNewContacts: () => Promise<void>
  getInboxActiveContacts: () => Promise<void>
  getBotMessagesByResult: () => Promise<void>
  getBotMessagesAIProviders: () => Promise<void>
  getMessagesBySender: () => Promise<void>
  getContactsByChannel: () => Promise<void>
  getContactsByCountry: () => Promise<void>
  getContactsBySource: () => Promise<void>
  getConversationHandoffs: () => Promise<void>
  getBotMessagesWithResponse: () => Promise<void>
  getBotMessagesNoResponse: () => Promise<void>
}

export type AnalysisStore = AnalysisState & AnalysisActions

export const createAnalysisStore = (props: Partial<AnalysisState>) =>
  createStore<AnalysisStore>((set, get) => ({
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
    inboxTotalContacts: 0,
    inboxNewContacts: 0,
    inboxActiveContacts: 0,
    botMessagesByResult: [],
    botMessagesAIProviders: [],
    messagesBySender: [],
    contactsByChannel: [],
    contactsByCountry: [],
    contactsBySource: [],
    conversationHandoffs: [],
    botMessagesWithResponse: [],
    botMessagesNoResponse: [],

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
      const {
        getContactCounts,
        getNewContactCounts,
        getInboxTotalContacts,
        getInboxNewContacts,
        getInboxActiveContacts,
        getBotMessagesByResult,
        getBotMessagesAIProviders,
        getMessagesBySender,
        getContactsByChannel,
        getContactsByCountry,
        getContactsBySource,
        getConversationHandoffs,
        getBotMessagesWithResponse,
        getBotMessagesNoResponse,
      } = get()
      set({ loading: true, errors: new Map<string, string>() })

      await Promise.all([
        getContactCounts(),
        getNewContactCounts(),
        getInboxTotalContacts(),
        getInboxNewContacts(),
        getInboxActiveContacts(),
        getBotMessagesByResult(),
        getBotMessagesAIProviders(),
        getMessagesBySender(),
        getContactsByChannel(),
        getContactsByCountry(),
        getContactsBySource(),
        getConversationHandoffs(),
        getBotMessagesWithResponse(),
        getBotMessagesNoResponse(),
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
  }))
