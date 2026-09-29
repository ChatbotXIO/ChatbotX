import type {
  BotMessageStats,
  CommentAutomationTimeseriesRow,
  ContactCountsSchema,
  ContactsByDimension,
  ConversationArchivedStats,
  ConversationAssignedByAdminStats,
  ConversationAssignedStats,
  ConversationFollowUpStats,
  ConversationHandoffStats,
  HumanAgentStats,
  ListCommentAutomationErrorsResponse,
  ListCommentAutomationTextTotalsResponse,
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
const COMMENT_AUTOMATION_PER_PAGE = 10

export type AnalysisDashboardType =
  | "contacts"
  | "conversations"
  | "reflinks"
  | "magic-links"
  | "comment-automation"
export type AnalysisState = {
  api: AnalyticsApi
  type: AnalysisDashboardType
  loading: boolean
  errors: Map<string, string>
  dashboardLoadStatus: Partial<Record<DashboardLoadAction, DashboardLoadStatus>>

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
  botMessagesByResult: BotMessageStats[]
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

  // comment-automation stats. Each table keeps its own page/perPage/total:
  // they hold unrelated result sets (45 days vs a handful of distinct comment
  // bodies), so a shared page size would resize three cards at once.
  commentAutomationReplyStats: CommentAutomationTimeseriesRow[]
  commentAutomationUserComments: ListCommentAutomationTextTotalsResponse["data"]
  commentAutomationUserCommentsPage: number
  commentAutomationUserCommentsPerPage: number
  commentAutomationUserCommentsPageCount: number
  commentAutomationUserCommentsTotal: number
  commentAutomationBotReplies: ListCommentAutomationTextTotalsResponse["data"]
  commentAutomationBotRepliesPage: number
  commentAutomationBotRepliesPerPage: number
  commentAutomationBotRepliesPageCount: number
  commentAutomationBotRepliesTotal: number
  commentAutomationErrors: ListCommentAutomationErrorsResponse["data"]
  commentAutomationErrorsPage: number
  commentAutomationErrorsPerPage: number
  commentAutomationErrorsPageCount: number
  commentAutomationErrorsTotal: number
  commentAutomationErrorsKeyword: string
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
  getBotMessagesByResult: () => Promise<void>
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
  getHumanAgentStats: () => Promise<void>

  getRefLinkStats: () => Promise<void>
  getReflinkContacts: () => Promise<void>
  setReflinkContactsPage: (page: number) => Promise<void>

  getMagicLinkStats: () => Promise<void>
  getMagicLinkContacts: () => Promise<void>
  setMagicLinkContactsPage: (page: number) => Promise<void>

  getCommentAutomationReplyStats: () => Promise<void>
  getCommentAutomationUserComments: () => Promise<void>
  getCommentAutomationBotReplies: () => Promise<void>
  getCommentAutomationErrors: () => Promise<void>
  setCommentAutomationUserCommentsPage: (page: number) => Promise<void>
  setCommentAutomationUserCommentsPerPage: (perPage: number) => Promise<void>
  setCommentAutomationBotRepliesPage: (page: number) => Promise<void>
  setCommentAutomationBotRepliesPerPage: (perPage: number) => Promise<void>
  setCommentAutomationErrorsPage: (page: number) => Promise<void>
  setCommentAutomationErrorsPerPage: (perPage: number) => Promise<void>
  setCommentAutomationErrorsKeyword: (keyword: string) => Promise<void>
}

export type DashboardLoadStatus =
  | "queued"
  | "loading"
  | "refreshing"
  | "success"
  | "error"

type AsyncAnalysisAction = {
  [Action in keyof AnalysisActions]: AnalysisActions[Action] extends () => Promise<void>
    ? Action
    : never
}[keyof AnalysisActions]

const DASHBOARD_LOAD_ACTIONS = {
  contacts: [
    "getInboxTotalContacts",
    "getInboxNewContacts",
    "getInboxActiveContacts",
    "getContactCounts",
    "getNewContactCounts",
    "getContactsByChannel",
    "getContactsBySource",
    "getContactsByCountry",
    "getBlockedContactCounts",
  ],
  conversations: [
    "getBotMessagesByResult",
    "getMessagesBySender",
    "getConversationHandoffs",
    "getHumanAgentStats",
    "getUniqueConversationsByAdmin",
    "getMessagesByAdmin",
    "getConversationAssignedByAdmin",
    "getConversationAssigned",
    "getConversationFollowUps",
    "getConversationArchived",
  ],
} as const satisfies Record<
  "contacts" | "conversations",
  readonly AsyncAnalysisAction[]
>

export type DashboardLoadAction =
  (typeof DASHBOARD_LOAD_ACTIONS)[keyof typeof DASHBOARD_LOAD_ACTIONS][number]

export type AnalysisStore = AnalysisState & AnalysisActions

export const createAnalysisStore = (
  props: Partial<AnalysisState> & {
    api: AnalyticsApi
    type: AnalysisDashboardType
    defaultSearchParams: AnalysisState["defaultSearchParams"]
  },
) => {
  let dashboardLoadGeneration = 0

  return createStore<AnalysisStore>((set, get) => {
    const rangeParams = () => {
      const { defaultSearchParams, from, to } = get()
      return {
        ...defaultSearchParams,
        from: from.toISOString(),
        to: to.toISOString(),
      }
    }

    const runGuarded = async <T>(
      action: DashboardLoadAction,
      fetch: () => Promise<T>,
      apply: (result: T) => Partial<AnalysisState>,
      onError?: Partial<AnalysisState>,
    ) => {
      const generation = dashboardLoadGeneration

      try {
        const result = await fetch()
        if (generation !== dashboardLoadGeneration) {
          return
        }

        set(apply(result))
      } catch (error: unknown) {
        if (generation !== dashboardLoadGeneration) {
          return
        }

        get().handleError(action, error)
        if (onError) {
          set(onError)
        }
      }
    }

    return {
      loading: false,
      errors: new Map<string, string>(),
      dashboardLoadStatus: {},

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
      botMessagesByResult: [],
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

      // Default comment-automation stats
      commentAutomationReplyStats: [],
      commentAutomationUserComments: [],
      commentAutomationUserCommentsPage: 1,
      commentAutomationUserCommentsPerPage: COMMENT_AUTOMATION_PER_PAGE,
      commentAutomationUserCommentsPageCount: 0,
      commentAutomationUserCommentsTotal: 0,
      commentAutomationBotReplies: [],
      commentAutomationBotRepliesPage: 1,
      commentAutomationBotRepliesPerPage: COMMENT_AUTOMATION_PER_PAGE,
      commentAutomationBotRepliesPageCount: 0,
      commentAutomationBotRepliesTotal: 0,
      commentAutomationErrors: [],
      commentAutomationErrorsPage: 1,
      commentAutomationErrorsPerPage: COMMENT_AUTOMATION_PER_PAGE,
      commentAutomationErrorsPageCount: 0,
      commentAutomationErrorsTotal: 0,
      commentAutomationErrorsKeyword: "",

      initialize: async () => {
        const { loadAnalysisData } = get()
        await loadAnalysisData()
      },

      handleError: (action: string, error: unknown) => {
        const message =
          error instanceof ORPCError
            ? error.message
            : "An unexpected error occurred. Please contact admin"

        set((state) => ({ errors: new Map(state.errors).set(action, message) }))
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

        if (type === "comment-automation") {
          const {
            getCommentAutomationReplyStats,
            getCommentAutomationUserComments,
            getCommentAutomationBotReplies,
            getCommentAutomationErrors,
          } = get()
          set({ loading: true, errors: new Map<string, string>() })
          await Promise.all([
            getCommentAutomationReplyStats(),
            getCommentAutomationUserComments(),
            getCommentAutomationBotReplies(),
            getCommentAutomationErrors(),
          ])
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

        if (type !== "contacts" && type !== "conversations") {
          return
        }

        const generation = ++dashboardLoadGeneration
        const actions = DASHBOARD_LOAD_ACTIONS[type]
        const dashboardLoadStatus = Object.fromEntries(
          actions.map((action) => [
            action,
            get().dashboardLoadStatus[action] === "success" ||
            get().dashboardLoadStatus[action] === "refreshing"
              ? "refreshing"
              : "queued",
          ]),
        ) as Partial<Record<DashboardLoadAction, DashboardLoadStatus>>
        set({
          loading: true,
          errors: new Map<string, string>(),
          dashboardLoadStatus,
        })

        const runAction = async (action: DashboardLoadAction) => {
          set((state) => ({
            dashboardLoadStatus: {
              ...state.dashboardLoadStatus,
              [action]:
                state.dashboardLoadStatus[action] === "refreshing"
                  ? "refreshing"
                  : "loading",
            },
          }))

          try {
            await get()[action]()
          } catch (error: unknown) {
            if (generation !== dashboardLoadGeneration) {
              return
            }

            get().handleError(action, error)
          }

          if (generation !== dashboardLoadGeneration) {
            return
          }

          set((state) => ({
            dashboardLoadStatus: {
              ...state.dashboardLoadStatus,
              [action]: state.errors.has(action) ? "error" : "success",
            },
          }))
        }

        await Promise.all(actions.map((action) => runAction(action)))

        if (generation === dashboardLoadGeneration) {
          set({ loading: false })
        }
      },

      setRange: async (props: { from: Date; to: Date }) => {
        // Every paginated panel goes back to page 1: a new range is a new result
        // set, and staying on page 3 of the old one shows an empty table.
        set({
          ...props,
          commentAutomationUserCommentsPage: 1,
          commentAutomationBotRepliesPage: 1,
          commentAutomationErrorsPage: 1,
        })

        const { loadAnalysisData } = get()
        await loadAnalysisData()
      },

      getContactCounts: () =>
        runGuarded(
          "getContactCounts",
          () => get().api.contactCountsPerDayAnalyticsAPI(rangeParams()),
          ({ data: contactCounts }) => ({ contactCounts }),
        ),

      getNewContactCounts: () =>
        runGuarded(
          "getNewContactCounts",
          () => get().api.newContactCountsPerDayAnalyticsAPI(rangeParams()),
          ({ data: newContactCounts }) => ({ newContactCounts }),
        ),

      getBlockedContactCounts: () =>
        runGuarded(
          "getBlockedContactCounts",
          () => get().api.blockedContactsPerDayAnalyticsAPI(rangeParams()),
          ({ data: blockedContactCounts }) => ({ blockedContactCounts }),
        ),

      getInboxTotalContacts: () =>
        runGuarded(
          "getInboxTotalContacts",
          () => get().api.contactsCountAnalyticsAPI(rangeParams()),
          (result) => ({ inboxTotalContacts: result.data.count }),
          { inboxTotalContacts: 0 },
        ),

      getInboxNewContacts: () =>
        runGuarded(
          "getInboxNewContacts",
          () => get().api.newContactsCountAnalyticsAPI(rangeParams()),
          (result) => ({ inboxNewContacts: result.data.count }),
          { inboxNewContacts: 0 },
        ),

      getInboxActiveContacts: () =>
        runGuarded(
          "getInboxActiveContacts",
          () => get().api.activeContactsCountAnalyticsAPI(rangeParams()),
          (result) => ({ inboxActiveContacts: result.data.count }),
          { inboxActiveContacts: 0 },
        ),

      getBotMessagesByResult: () =>
        runGuarded(
          "getBotMessagesByResult",
          () =>
            get().api.botMessagesByResultAnalyticsAPI({
              ...rangeParams(),
              granularity: "day",
            }),
          ({ data: botMessagesByResult }) => ({ botMessagesByResult }),
        ),

      getMessagesBySender: () =>
        runGuarded(
          "getMessagesBySender",
          () => get().api.messagesBySenderAnalyticsAPI(rangeParams()),
          ({ data: messagesBySender }) => ({ messagesBySender }),
        ),

      getContactsByChannel: () =>
        runGuarded(
          "getContactsByChannel",
          () =>
            get().api.contactsByDimensionAnalyticsAPI({
              ...rangeParams(),
              dimension: "channel",
            }),
          ({ data: contactsByChannel }) => ({ contactsByChannel }),
        ),

      getContactsByCountry: () =>
        runGuarded(
          "getContactsByCountry",
          () =>
            get().api.contactsByDimensionAnalyticsAPI({
              ...rangeParams(),
              dimension: "country",
            }),
          ({ data: contactsByCountry }) => ({ contactsByCountry }),
        ),

      getContactsBySource: () =>
        runGuarded(
          "getContactsBySource",
          () =>
            get().api.contactsByDimensionAnalyticsAPI({
              ...rangeParams(),
              dimension: "source",
            }),
          ({ data: contactsBySource }) => ({ contactsBySource }),
        ),

      getConversationHandoffs: () =>
        runGuarded(
          "getConversationHandoffs",
          () => get().api.conversationHandoffsAnalyticsAPI(rangeParams()),
          ({ data: conversationHandoffs }) => ({ conversationHandoffs }),
        ),

      getConversationFollowUps: () =>
        runGuarded(
          "getConversationFollowUps",
          () => get().api.conversationFollowUpsAnalyticsAPI(rangeParams()),
          ({ data: conversationFollowUps }) => ({ conversationFollowUps }),
        ),

      getConversationArchived: () =>
        runGuarded(
          "getConversationArchived",
          () => get().api.conversationArchivedAnalyticsAPI(rangeParams()),
          ({ data: conversationArchived }) => ({ conversationArchived }),
        ),

      getConversationAssigned: () =>
        runGuarded(
          "getConversationAssigned",
          () => get().api.conversationAssignedAnalyticsAPI(rangeParams()),
          ({ data: conversationAssigned }) => ({ conversationAssigned }),
        ),

      getConversationAssignedByAdmin: () =>
        runGuarded(
          "getConversationAssignedByAdmin",
          () =>
            get().api.conversationAssignedByAdminAnalyticsAPI(rangeParams()),
          ({ data: conversationAssignedByAdmin }) => ({
            conversationAssignedByAdmin,
          }),
        ),

      getUniqueConversationsByAdmin: () =>
        runGuarded(
          "getUniqueConversationsByAdmin",
          () => get().api.uniqueConversationsByAdminAnalyticsAPI(rangeParams()),
          ({ data: uniqueConversationsByAdmin }) => ({
            uniqueConversationsByAdmin,
          }),
        ),

      getMessagesByAdmin: () =>
        runGuarded(
          "getMessagesByAdmin",
          () => get().api.messagesByAdminAnalyticsAPI(rangeParams()),
          ({ data: messagesByAdmin }) => ({ messagesByAdmin }),
        ),

      getHumanAgentStats: () =>
        runGuarded(
          "getHumanAgentStats",
          () => get().api.humanAgentStatsAnalyticsAPI(rangeParams()),
          ({ data: humanAgentStats }) => ({ humanAgentStats }),
        ),

      // `linkId`/`timezone` are only present in `defaultSearchParams` when the
      // reflink dashboard mounted the store (see `ReflinkAnalytics`), the only
      // place these two actions are wired up — the `as string` assertions
      // below reflect that runtime contract, which the shared
      // `defaultSearchParams` type can't express.
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

      // Same reflink-only runtime contract as `getRefLinkStats` above — the
      // `as string` assertion on `linkId` reflects that, not a type gap.
      getReflinkContacts: async () => {
        const { api, defaultSearchParams, reflinkContactsPage, from, to } =
          get()

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
      // only place these two actions are wired up — the `as string` assertions
      // below reflect that runtime contract, which the shared
      // `defaultSearchParams` type can't express.
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

      // `automationId`/`timezone` are only present in `defaultSearchParams` when
      // the comment-automation dashboard mounted the store (see
      // `CommentAutomationAnalytics`), the only place these actions are wired up
      // — the `as string` assertions below reflect that runtime contract, the
      // same way the reflink actions above do.
      getCommentAutomationReplyStats: async () => {
        const { api, defaultSearchParams, from, to } = get()

        try {
          const { data } = await api.commentAutomationReplyStats({
            workspaceId: defaultSearchParams.workspaceId,
            automationId: defaultSearchParams.automationId as string,
            timezone: defaultSearchParams.timezone as string,
            startDate: from.toISOString(),
            endDate: to.toISOString(),
          })

          set({ commentAutomationReplyStats: data })
        } catch (error: unknown) {
          get().handleError("getCommentAutomationReplyStats", error)
        }
      },

      getCommentAutomationUserComments: async () => {
        const {
          api,
          defaultSearchParams,
          commentAutomationUserCommentsPage,
          commentAutomationUserCommentsPerPage,
          from,
          to,
        } = get()

        try {
          const result = await api.commentAutomationUserComments({
            workspaceId: defaultSearchParams.workspaceId,
            automationId: defaultSearchParams.automationId as string,
            timezone: defaultSearchParams.timezone as string,
            page: commentAutomationUserCommentsPage,
            perPage: commentAutomationUserCommentsPerPage,
            startDate: from.toISOString(),
            endDate: to.toISOString(),
          })

          set({
            commentAutomationUserComments: result.data,
            commentAutomationUserCommentsPageCount: result.pageCount,
            commentAutomationUserCommentsTotal: result.total,
          })
        } catch (error: unknown) {
          get().handleError("getCommentAutomationUserComments", error)
        }
      },

      getCommentAutomationBotReplies: async () => {
        const {
          api,
          defaultSearchParams,
          commentAutomationBotRepliesPage,
          commentAutomationBotRepliesPerPage,
          from,
          to,
        } = get()

        try {
          const result = await api.commentAutomationBotReplies({
            workspaceId: defaultSearchParams.workspaceId,
            automationId: defaultSearchParams.automationId as string,
            timezone: defaultSearchParams.timezone as string,
            page: commentAutomationBotRepliesPage,
            perPage: commentAutomationBotRepliesPerPage,
            startDate: from.toISOString(),
            endDate: to.toISOString(),
          })

          set({
            commentAutomationBotReplies: result.data,
            commentAutomationBotRepliesPageCount: result.pageCount,
            commentAutomationBotRepliesTotal: result.total,
          })
        } catch (error: unknown) {
          get().handleError("getCommentAutomationBotReplies", error)
        }
      },

      getCommentAutomationErrors: async () => {
        const {
          api,
          defaultSearchParams,
          commentAutomationErrorsPage,
          commentAutomationErrorsPerPage,
          commentAutomationErrorsKeyword,
          from,
          to,
        } = get()

        try {
          const result = await api.commentAutomationErrors({
            workspaceId: defaultSearchParams.workspaceId,
            automationId: defaultSearchParams.automationId as string,
            timezone: defaultSearchParams.timezone as string,
            page: commentAutomationErrorsPage,
            perPage: commentAutomationErrorsPerPage,
            keyword: commentAutomationErrorsKeyword || undefined,
            startDate: from.toISOString(),
            endDate: to.toISOString(),
          })

          set({
            commentAutomationErrors: result.data,
            commentAutomationErrorsPageCount: result.pageCount,
            commentAutomationErrorsTotal: result.total,
          })
        } catch (error: unknown) {
          get().handleError("getCommentAutomationErrors", error)
        }
      },

      setCommentAutomationUserCommentsPage: async (page: number) => {
        set({ commentAutomationUserCommentsPage: page })

        const { getCommentAutomationUserComments } = get()
        await getCommentAutomationUserComments()
      },

      // A new page size re-slices the whole result set, so page 1 — otherwise
      // "50 per page" from page 4 of a 10-per-page list lands past the end.
      setCommentAutomationUserCommentsPerPage: async (perPage: number) => {
        set({
          commentAutomationUserCommentsPerPage: perPage,
          commentAutomationUserCommentsPage: 1,
        })

        const { getCommentAutomationUserComments } = get()
        await getCommentAutomationUserComments()
      },

      setCommentAutomationBotRepliesPage: async (page: number) => {
        set({ commentAutomationBotRepliesPage: page })

        const { getCommentAutomationBotReplies } = get()
        await getCommentAutomationBotReplies()
      },

      setCommentAutomationBotRepliesPerPage: async (perPage: number) => {
        set({
          commentAutomationBotRepliesPerPage: perPage,
          commentAutomationBotRepliesPage: 1,
        })

        const { getCommentAutomationBotReplies } = get()
        await getCommentAutomationBotReplies()
      },

      setCommentAutomationErrorsPage: async (page: number) => {
        set({ commentAutomationErrorsPage: page })

        const { getCommentAutomationErrors } = get()
        await getCommentAutomationErrors()
      },

      setCommentAutomationErrorsPerPage: async (perPage: number) => {
        set({
          commentAutomationErrorsPerPage: perPage,
          commentAutomationErrorsPage: 1,
        })

        const { getCommentAutomationErrors } = get()
        await getCommentAutomationErrors()
      },

      setCommentAutomationErrorsKeyword: async (keyword: string) => {
        // A new filter is a new result set, so page 1 — otherwise a search from
        // page 3 lands on an empty table.
        set({
          commentAutomationErrorsKeyword: keyword,
          commentAutomationErrorsPage: 1,
        })

        const { getCommentAutomationErrors } = get()
        await getCommentAutomationErrors()
      },
    }
  })
}
