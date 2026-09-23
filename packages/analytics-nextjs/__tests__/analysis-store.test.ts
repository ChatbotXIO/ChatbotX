import { ORPCError } from "@orpc/client"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { createAnalysisStore } from "../src/provider/analysis-store"
import type { AnalyticsApi } from "../src/provider/analytics-api-context"

const buildApi = (): AnalyticsApi =>
  ({
    contactCountsPerDayAnalyticsAPI: vi.fn(),
    newContactCountsPerDayAnalyticsAPI: vi.fn(),
    blockedContactsPerDayAnalyticsAPI: vi.fn(),
    blockedContactsCountAnalyticsAPI: vi.fn(),
    contactsCountAnalyticsAPI: vi.fn(),
    newContactsCountAnalyticsAPI: vi.fn(),
    activeContactsCountAnalyticsAPI: vi.fn(),
    botMessagesByResultAnalyticsAPI: vi.fn(),
    botMessagesAIProvidersAnalyticsAPI: vi.fn(),
    messagesBySenderAnalyticsAPI: vi.fn(),
    contactsByDimensionAnalyticsAPI: vi.fn(),
    conversationHandoffsAnalyticsAPI: vi.fn(),
    conversationFollowUpsAnalyticsAPI: vi.fn(),
    conversationArchivedAnalyticsAPI: vi.fn(),
    conversationAssignedAnalyticsAPI: vi.fn(),
    conversationAssignedByAdminAnalyticsAPI: vi.fn(),
    uniqueConversationsByAdminAnalyticsAPI: vi.fn(),
    messagesByAdminAnalyticsAPI: vi.fn(),
    botMessagesWithResponseAnalyticsAPI: vi.fn(),
    botMessagesNoResponseAnalyticsAPI: vi.fn(),
    humanAgentStatsAnalyticsAPI: vi.fn(),
    refLinkStats: vi.fn(),
    refLinkContacts: vi.fn(),
    magicLinkStats: vi.fn(),
    magicLinkContacts: vi.fn(),
    commentAutomationReplyStats: vi.fn(),
    commentAutomationUserComments: vi.fn(),
    commentAutomationBotReplies: vi.fn(),
    commentAutomationErrors: vi.fn(),
    // Not used by any store action, but `AnalyticsApi` is the full router
    // client: leave one out and the cast below stops compiling.
    macActiveContactCountByWorkspaceAPI: vi.fn(),
    resetFlowAnalytics: vi.fn(),
    getFlowAnalytics: vi.fn(),
    getSequenceStepStatsAnalyticsAPI: vi.fn(),
    getBroadcastStatsAnalyticsAPI: vi.fn(),
  }) as AnalyticsApi

const from = new Date("2026-08-01T00:00:00.000Z")
const to = new Date("2026-08-10T00:00:00.000Z")

const baseSearchParams = { workspaceId: "ws-1" }

describe("analysis store", () => {
  let api: ReturnType<typeof buildApi>

  beforeEach(() => {
    api = buildApi()
  })

  describe("date-range stats — array response shape", () => {
    test("getContactCounts calls contactCountsPerDayAnalyticsAPI with the search params and ISO date range", async () => {
      ;(
        api.contactCountsPerDayAnalyticsAPI as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        data: [{ date: "2026-08-01", count: 5 }],
      })

      const store = createAnalysisStore({
        api,
        type: "contacts",
        defaultSearchParams: baseSearchParams,
        from,
        to,
      })

      await store.getState().getContactCounts()

      expect(api.contactCountsPerDayAnalyticsAPI).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        from: from.toISOString(),
        to: to.toISOString(),
      })
      expect(store.getState().contactCounts).toEqual([
        { date: "2026-08-01", count: 5 },
      ])
    })

    test("getContactCounts sets the ORPCError message on rejection", async () => {
      ;(
        api.contactCountsPerDayAnalyticsAPI as ReturnType<typeof vi.fn>
      ).mockRejectedValue(
        new ORPCError("BAD_REQUEST", { message: "range too large" }),
      )

      const store = createAnalysisStore({
        api,
        type: "contacts",
        defaultSearchParams: baseSearchParams,
        from,
        to,
      })

      await store.getState().getContactCounts()

      expect(store.getState().errors.get("getContactCounts")).toBe(
        "range too large",
      )
      // A rejection must not clobber the array stat with a partial value.
      expect(store.getState().contactCounts).toEqual([])
    })

    test("getContactCounts falls back to a generic message for a non-ORPCError rejection", async () => {
      ;(
        api.contactCountsPerDayAnalyticsAPI as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error("network down"))

      const store = createAnalysisStore({
        api,
        type: "contacts",
        defaultSearchParams: baseSearchParams,
        from,
        to,
      })

      await store.getState().getContactCounts()

      expect(store.getState().errors.get("getContactCounts")).toBe(
        "An unexpected error occurred. Please contact admin",
      )
    })
  })

  describe("date-range stats — scalar count response shape", () => {
    test("getInboxBlockedContacts reads result.data.count and resets to 0 on error", async () => {
      const store = createAnalysisStore({
        api,
        type: "contacts",
        defaultSearchParams: baseSearchParams,
        from,
        to,
      })

      ;(
        api.blockedContactsCountAnalyticsAPI as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        data: { count: 42 },
      })
      await store.getState().getInboxBlockedContacts()

      expect(api.blockedContactsCountAnalyticsAPI).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        from: from.toISOString(),
        to: to.toISOString(),
      })
      expect(store.getState().inboxBlockedContacts).toBe(42)

      ;(
        api.blockedContactsCountAnalyticsAPI as ReturnType<typeof vi.fn>
      ).mockRejectedValue(
        new ORPCError("INTERNAL_SERVER_ERROR", { message: "boom" }),
      )
      await store.getState().getInboxBlockedContacts()

      expect(store.getState().errors.get("getInboxBlockedContacts")).toBe(
        "boom",
      )
      // Unlike the array-shaped stats, the scalar count is explicitly reset
      // to 0 on error rather than left at its last successful value.
      expect(store.getState().inboxBlockedContacts).toBe(0)
    })
  })

  describe("reflink stats", () => {
    const reflinkSearchParams = {
      workspaceId: "ws-1",
      linkId: "link-1",
      timezone: "Asia/Ho_Chi_Minh",
    }

    test("getRefLinkStats sends linkId/timezone and startDate/endDate (not from/to)", async () => {
      ;(api.refLinkStats as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [{ date: "2026-08-01", count: 3 }],
      })

      const store = createAnalysisStore({
        api,
        type: "reflinks",
        defaultSearchParams: reflinkSearchParams,
        from,
        to,
      })

      await store.getState().getRefLinkStats()

      expect(api.refLinkStats).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        linkId: "link-1",
        timezone: "Asia/Ho_Chi_Minh",
        startDate: from.toISOString(),
        endDate: to.toISOString(),
      })
      expect(store.getState().refLinkStats).toEqual([
        { date: "2026-08-01", count: 3 },
      ])
    })

    test("getRefLinkStats sets the ORPCError message on rejection", async () => {
      ;(api.refLinkStats as ReturnType<typeof vi.fn>).mockRejectedValue(
        new ORPCError("NOT_FOUND", { message: "link not found" }),
      )

      const store = createAnalysisStore({
        api,
        type: "reflinks",
        defaultSearchParams: reflinkSearchParams,
        from,
        to,
      })

      await store.getState().getRefLinkStats()

      expect(store.getState().errors.get("getRefLinkStats")).toBe(
        "link not found",
      )
    })

    test("getReflinkContacts sends page/perPage alongside linkId and the date range", async () => {
      ;(api.refLinkContacts as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [{ id: "contact-1" }],
        pageCount: 4,
      })

      const store = createAnalysisStore({
        api,
        type: "reflinks",
        defaultSearchParams: reflinkSearchParams,
        from,
        to,
      })
      // `reflinkContactsPage` can't be seeded via `createAnalysisStore` props
      // (the store's own literal default is applied after the `...props`
      // spread and always wins) — go through the real page-setter instead,
      // which is how the page actually changes at runtime.
      await store.getState().setReflinkContactsPage(2)
      ;(api.refLinkContacts as ReturnType<typeof vi.fn>).mockClear()
      ;(api.refLinkContacts as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [{ id: "contact-1" }],
        pageCount: 4,
      })

      await store.getState().getReflinkContacts()

      expect(api.refLinkContacts).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        linkId: "link-1",
        timezone: "Asia/Ho_Chi_Minh",
        page: 2,
        perPage: 10,
        startDate: from.toISOString(),
        endDate: to.toISOString(),
      })
      expect(store.getState().reflinkContacts).toEqual([{ id: "contact-1" }])
      expect(store.getState().reflinkContactsPageCount).toBe(4)
    })

    test("getReflinkContacts sets the error state on rejection", async () => {
      ;(api.refLinkContacts as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("network down"),
      )

      const store = createAnalysisStore({
        api,
        type: "reflinks",
        defaultSearchParams: reflinkSearchParams,
        from,
        to,
      })

      await store.getState().getReflinkContacts()

      expect(store.getState().errors.get("getReflinkContacts")).toBe(
        "An unexpected error occurred. Please contact admin",
      )
    })

    test("setReflinkContactsPage updates the page then refetches contacts for that page", async () => {
      ;(api.refLinkContacts as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
        pageCount: 1,
      })

      const store = createAnalysisStore({
        api,
        type: "reflinks",
        defaultSearchParams: reflinkSearchParams,
        from,
        to,
      })

      await store.getState().setReflinkContactsPage(3)

      expect(store.getState().reflinkContactsPage).toBe(3)
      expect(api.refLinkContacts).toHaveBeenCalledWith(
        expect.objectContaining({ page: 3 }),
      )
    })
  })

  describe("magic-link stats", () => {
    const magicLinkSearchParams = {
      workspaceId: "ws-1",
      linkId: "magic-1",
      timezone: "UTC",
    }

    test("getMagicLinkStats sends linkId/timezone and startDate/endDate", async () => {
      ;(api.magicLinkStats as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [{ date: "2026-08-02", count: 7 }],
      })

      const store = createAnalysisStore({
        api,
        type: "magic-links",
        defaultSearchParams: magicLinkSearchParams,
        from,
        to,
      })

      await store.getState().getMagicLinkStats()

      expect(api.magicLinkStats).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        linkId: "magic-1",
        timezone: "UTC",
        startDate: from.toISOString(),
        endDate: to.toISOString(),
      })
      expect(store.getState().magicLinkStats).toEqual([
        { date: "2026-08-02", count: 7 },
      ])
    })

    test("getMagicLinkStats sets the error state on rejection", async () => {
      ;(api.magicLinkStats as ReturnType<typeof vi.fn>).mockRejectedValue(
        new ORPCError("FORBIDDEN", { message: "not allowed" }),
      )

      const store = createAnalysisStore({
        api,
        type: "magic-links",
        defaultSearchParams: magicLinkSearchParams,
        from,
        to,
      })

      await store.getState().getMagicLinkStats()

      expect(store.getState().errors.get("getMagicLinkStats")).toBe(
        "not allowed",
      )
    })

    test("getMagicLinkContacts sends page/perPage alongside linkId and the date range", async () => {
      ;(api.magicLinkContacts as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [{ id: "contact-9" }],
        pageCount: 2,
      })

      const store = createAnalysisStore({
        api,
        type: "magic-links",
        defaultSearchParams: magicLinkSearchParams,
        from,
        to,
        magicLinkContactsPage: 1,
      })

      await store.getState().getMagicLinkContacts()

      expect(api.magicLinkContacts).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        linkId: "magic-1",
        timezone: "UTC",
        page: 1,
        perPage: 10,
        startDate: from.toISOString(),
        endDate: to.toISOString(),
      })
      expect(store.getState().magicLinkContacts).toEqual([{ id: "contact-9" }])
      expect(store.getState().magicLinkContactsPageCount).toBe(2)
    })

    test("setMagicLinkContactsPage updates the page then refetches contacts for that page", async () => {
      ;(api.magicLinkContacts as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
        pageCount: 1,
      })

      const store = createAnalysisStore({
        api,
        type: "magic-links",
        defaultSearchParams: magicLinkSearchParams,
        from,
        to,
      })

      await store.getState().setMagicLinkContactsPage(5)

      expect(store.getState().magicLinkContactsPage).toBe(5)
      expect(api.magicLinkContacts).toHaveBeenCalledWith(
        expect.objectContaining({ page: 5 }),
      )
    })
  })

  describe("loadAnalysisData / setRange", () => {
    const selectedContactApiKeys = [
      "contactCountsPerDayAnalyticsAPI",
      "newContactCountsPerDayAnalyticsAPI",
      "blockedContactsPerDayAnalyticsAPI",
      "contactsCountAnalyticsAPI",
      "newContactsCountAnalyticsAPI",
      "activeContactsCountAnalyticsAPI",
      "contactsByDimensionAnalyticsAPI",
    ] as const

    const selectedConversationApiKeys = [
      "botMessagesByResultAnalyticsAPI",
      "messagesBySenderAnalyticsAPI",
      "conversationHandoffsAnalyticsAPI",
      "humanAgentStatsAnalyticsAPI",
      "uniqueConversationsByAdminAnalyticsAPI",
      "messagesByAdminAnalyticsAPI",
      "conversationAssignedByAdminAnalyticsAPI",
      "conversationAssignedAnalyticsAPI",
      "conversationFollowUpsAnalyticsAPI",
      "conversationArchivedAnalyticsAPI",
    ] as const

    const stubContactsApi = () => {
      ;(
        api.contactCountsPerDayAnalyticsAPI as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        data: [{ date: "2026-08-01", count: 1 }],
      })
      ;(
        api.newContactCountsPerDayAnalyticsAPI as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        data: [{ date: "2026-08-01", count: 2 }],
      })
      ;(
        api.blockedContactsPerDayAnalyticsAPI as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        data: [{ date: "2026-08-01", count: 3 }],
      })
      for (const [key, count] of [
        ["contactsCountAnalyticsAPI", 4],
        ["newContactsCountAnalyticsAPI", 5],
        ["activeContactsCountAnalyticsAPI", 6],
      ] as const) {
        ;(api[key] as ReturnType<typeof vi.fn>).mockResolvedValue({
          data: { count },
        })
      }
      ;(
        api.contactsByDimensionAnalyticsAPI as ReturnType<typeof vi.fn>
      ).mockImplementation(({ dimension }: { dimension: string }) =>
        Promise.resolve({
          data: [{ dimension, uniqueContacts: 7 }],
        }),
      )
    }

    const stubConversationsApi = () => {
      for (const key of selectedConversationApiKeys) {
        ;(api[key] as ReturnType<typeof vi.fn>).mockResolvedValue({
          data: [{ id: key }],
        })
      }
    }

    test("loads only the nine visible contact datasets and leaves conversation endpoints untouched", async () => {
      stubContactsApi()
      for (const key of selectedConversationApiKeys) {
        ;(api[key] as ReturnType<typeof vi.fn>).mockRejectedValue(
          new Error(`unexpected ${key}`),
        )
      }

      const store = createAnalysisStore({
        api,
        type: "contacts",
        defaultSearchParams: baseSearchParams,
        from,
        to,
      })

      await store.getState().initialize()

      expect(store.getState()).toMatchObject({
        contactCounts: [{ date: "2026-08-01", count: 1 }],
        newContactCounts: [{ date: "2026-08-01", count: 2 }],
        blockedContactCounts: [{ date: "2026-08-01", count: 3 }],
        inboxTotalContacts: 4,
        inboxNewContacts: 5,
        inboxActiveContacts: 6,
        contactsByChannel: [{ dimension: "channel", uniqueContacts: 7 }],
        contactsByCountry: [{ dimension: "country", uniqueContacts: 7 }],
        contactsBySource: [{ dimension: "source", uniqueContacts: 7 }],
        loading: false,
      })
      for (const key of selectedContactApiKeys) {
        expect(api[key]).toHaveBeenCalledTimes(
          key === "contactsByDimensionAnalyticsAPI" ? 3 : 1,
        )
      }
      for (const key of selectedConversationApiKeys) {
        expect(api[key]).not.toHaveBeenCalled()
      }
      expect(api.blockedContactsCountAnalyticsAPI).not.toHaveBeenCalled()
      expect(api.botMessagesAIProvidersAnalyticsAPI).not.toHaveBeenCalled()
      expect(api.botMessagesWithResponseAnalyticsAPI).not.toHaveBeenCalled()
      expect(api.botMessagesNoResponseAnalyticsAPI).not.toHaveBeenCalled()
    })

    test("loads only the ten visible conversation datasets until their required work settles", async () => {
      stubConversationsApi()
      const botMessagesResult = Promise.withResolvers<{
        data: [{ id: string }]
      }>()
      ;(
        api.botMessagesByResultAnalyticsAPI as ReturnType<typeof vi.fn>
      ).mockImplementation(() => botMessagesResult.promise)
      for (const key of selectedContactApiKeys) {
        ;(api[key] as ReturnType<typeof vi.fn>).mockRejectedValue(
          new Error(`unexpected ${key}`),
        )
      }

      const store = createAnalysisStore({
        api,
        type: "conversations",
        defaultSearchParams: baseSearchParams,
        from,
        to,
      })
      const loadPromise = store.getState().loadAnalysisData()

      const nextTick = Promise.withResolvers<void>()
      setImmediate(nextTick.resolve)
      await nextTick.promise
      expect(store.getState().loading).toBe(true)
      botMessagesResult.resolve({ data: [{ id: "bot-messages" }] })
      await loadPromise

      expect(store.getState().loading).toBe(false)
      expect(store.getState().humanAgentStats).toEqual([
        { id: "humanAgentStatsAnalyticsAPI" },
      ])
      for (const key of selectedConversationApiKeys) {
        expect(api[key]).toHaveBeenCalledTimes(1)
      }
      for (const key of selectedContactApiKeys) {
        expect(api[key]).not.toHaveBeenCalled()
      }
      expect(api.botMessagesAIProvidersAnalyticsAPI).not.toHaveBeenCalled()
      expect(api.botMessagesWithResponseAnalyticsAPI).not.toHaveBeenCalled()
      expect(api.botMessagesNoResponseAnalyticsAPI).not.toHaveBeenCalled()
    })

    test.each([
      [
        "contacts",
        stubContactsApi,
        selectedContactApiKeys,
        "contactCountsPerDayAnalyticsAPI",
      ],
      [
        "conversations",
        stubConversationsApi,
        selectedConversationApiKeys,
        "botMessagesByResultAnalyticsAPI",
      ],
    ] as const)("reloads only the selected %s profile with a new range", async (type, stubApi, selectedApiKeys, rangeEndpoint) => {
      stubApi()
      const store = createAnalysisStore({
        api,
        type,
        defaultSearchParams: baseSearchParams,
        from,
        to,
      })
      const nextFrom = new Date("2026-09-01T00:00:00.000Z")
      const nextTo = new Date("2026-09-10T00:00:00.000Z")

      await store.getState().setRange({ from: nextFrom, to: nextTo })

      expect(store.getState().from).toBe(nextFrom)
      expect(store.getState().to).toBe(nextTo)
      for (const key of selectedApiKeys) {
        expect(api[key]).toHaveBeenCalled()
      }
      expect(api[rangeEndpoint]).toHaveBeenLastCalledWith(
        expect.objectContaining({
          from: nextFrom.toISOString(),
          to: nextTo.toISOString(),
        }),
      )
    })
    test("keeps successful contact datasets usable when one selected endpoint fails", async () => {
      stubContactsApi()
      ;(
        api.newContactCountsPerDayAnalyticsAPI as ReturnType<typeof vi.fn>
      ).mockRejectedValue(
        new ORPCError("BAD_REQUEST", { message: "range too large" }),
      )
      const store = createAnalysisStore({
        api,
        type: "contacts",
        defaultSearchParams: baseSearchParams,
        from,
        to,
      })

      await store.getState().loadAnalysisData()

      expect(store.getState().contactCounts).toEqual([
        { date: "2026-08-01", count: 1 },
      ])
      expect(store.getState().errors.get("getNewContactCounts")).toBe(
        "range too large",
      )
      expect(store.getState().loading).toBe(false)
      expect(store.getState().dashboardLoadStatus.getNewContactCounts).toBe(
        "error",
      )
      expect(store.getState().dashboardLoadStatus.getContactCounts).toBe(
        "success",
      )
      expect(api.contactsByDimensionAnalyticsAPI).toHaveBeenCalledTimes(3)

      ;(
        api.newContactCountsPerDayAnalyticsAPI as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ data: [{ date: "2026-08-01", count: 2 }] })
      await store.getState().loadAnalysisData()

      expect(store.getState().errors.size).toBe(0)
      expect(store.getState().dashboardLoadStatus.getNewContactCounts).toBe(
        "success",
      )
    })

    const flushMicrotasks = async () => {
      await new Promise<void>((resolve) => queueMicrotask(resolve))
      await new Promise<void>((resolve) => queueMicrotask(resolve))
    }

    test("loads contact dashboards in UI-order batches and publishes KPI status before charts", async () => {
      stubContactsApi()
      const totalContacts = Promise.withResolvers<{ data: { count: number } }>()
      const newContacts = Promise.withResolvers<{ data: { count: number } }>()
      const activeContacts = Promise.withResolvers<{
        data: { count: number }
      }>()
      ;(
        api.contactsCountAnalyticsAPI as ReturnType<typeof vi.fn>
      ).mockImplementation(() => totalContacts.promise)
      ;(
        api.newContactsCountAnalyticsAPI as ReturnType<typeof vi.fn>
      ).mockImplementation(() => newContacts.promise)
      ;(
        api.activeContactsCountAnalyticsAPI as ReturnType<typeof vi.fn>
      ).mockImplementation(() => activeContacts.promise)

      const store = createAnalysisStore({
        api,
        type: "contacts",
        defaultSearchParams: baseSearchParams,
        from,
        to,
      })
      const loadPromise = store.getState().loadAnalysisData()

      expect(api.contactCountsPerDayAnalyticsAPI).not.toHaveBeenCalled()
      expect(api.contactsByDimensionAnalyticsAPI).not.toHaveBeenCalled()
      expect(store.getState().dashboardLoadStatus).toMatchObject({
        getInboxTotalContacts: "loading",
        getInboxNewContacts: "loading",
        getInboxActiveContacts: "loading",
        getContactCounts: "queued",
      })

      totalContacts.resolve({ data: { count: 4 } })
      newContacts.resolve({ data: { count: 5 } })
      activeContacts.resolve({ data: { count: 6 } })
      await flushMicrotasks()

      expect(store.getState().inboxTotalContacts).toBe(4)
      expect(store.getState().dashboardLoadStatus).toMatchObject({
        getInboxTotalContacts: "success",
        getInboxNewContacts: "success",
        getInboxActiveContacts: "success",
      })
      expect(store.getState().loading).toBe(true)
      expect(api.contactCountsPerDayAnalyticsAPI).toHaveBeenCalledTimes(1)
      expect(api.newContactCountsPerDayAnalyticsAPI).toHaveBeenCalledTimes(1)
      expect(api.contactsByDimensionAnalyticsAPI).not.toHaveBeenCalled()

      await loadPromise

      expect(api.contactsByDimensionAnalyticsAPI).toHaveBeenCalledTimes(3)
      expect(api.contactsByDimensionAnalyticsAPI).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ dimension: "channel" }),
      )
      expect(api.contactsByDimensionAnalyticsAPI).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ dimension: "source" }),
      )
      expect(api.contactsByDimensionAnalyticsAPI).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({ dimension: "country" }),
      )
      expect(store.getState().dashboardLoadStatus.getBlockedContactCounts).toBe(
        "success",
      )
    })

    test("loads conversation dashboards in desktop-row batches", async () => {
      stubConversationsApi()
      const botMessages = Promise.withResolvers<{ data: [{ id: string }] }>()
      const messagesBySender = Promise.withResolvers<{
        data: [{ id: string }]
      }>()
      const handoffs = Promise.withResolvers<{ data: [{ id: string }] }>()
      const humanAgentStats = Promise.withResolvers<{
        data: [{ id: string }]
      }>()
      ;(
        api.botMessagesByResultAnalyticsAPI as ReturnType<typeof vi.fn>
      ).mockImplementation(() => botMessages.promise)
      ;(
        api.messagesBySenderAnalyticsAPI as ReturnType<typeof vi.fn>
      ).mockImplementation(() => messagesBySender.promise)
      ;(
        api.conversationHandoffsAnalyticsAPI as ReturnType<typeof vi.fn>
      ).mockImplementation(() => handoffs.promise)
      ;(
        api.humanAgentStatsAnalyticsAPI as ReturnType<typeof vi.fn>
      ).mockImplementation(() => humanAgentStats.promise)

      const store = createAnalysisStore({
        api,
        type: "conversations",
        defaultSearchParams: baseSearchParams,
        from,
        to,
      })
      const loadPromise = store.getState().loadAnalysisData()

      expect(api.conversationHandoffsAnalyticsAPI).not.toHaveBeenCalled()
      expect(api.humanAgentStatsAnalyticsAPI).not.toHaveBeenCalled()

      botMessages.resolve({ data: [{ id: "bot" }] })
      messagesBySender.resolve({ data: [{ id: "sender" }] })
      await flushMicrotasks()
      expect(api.conversationHandoffsAnalyticsAPI).toHaveBeenCalledTimes(1)
      expect(api.humanAgentStatsAnalyticsAPI).not.toHaveBeenCalled()

      handoffs.resolve({ data: [{ id: "handoff" }] })
      await flushMicrotasks()
      expect(api.humanAgentStatsAnalyticsAPI).toHaveBeenCalledTimes(1)
      expect(api.uniqueConversationsByAdminAnalyticsAPI).not.toHaveBeenCalled()

      humanAgentStats.resolve({ data: [{ id: "human" }] })
      await loadPromise

      expect(api.uniqueConversationsByAdminAnalyticsAPI).toHaveBeenCalledTimes(
        1,
      )
      expect(api.messagesByAdminAnalyticsAPI).toHaveBeenCalledTimes(1)
      expect(api.conversationAssignedByAdminAnalyticsAPI).toHaveBeenCalledTimes(
        1,
      )
      expect(api.conversationAssignedAnalyticsAPI).toHaveBeenCalledTimes(1)
      expect(api.conversationFollowUpsAnalyticsAPI).toHaveBeenCalledTimes(1)
      expect(api.conversationArchivedAnalyticsAPI).toHaveBeenCalledTimes(1)
    })

    test("keeps the newest range data, errors, and unstarted batches when an older load settles", async () => {
      stubContactsApi()
      const olderTotal = Promise.withResolvers<{ data: { count: number } }>()
      let contactsCountCall = 0
      ;(
        api.contactsCountAnalyticsAPI as ReturnType<typeof vi.fn>
      ).mockImplementation(() => {
        contactsCountCall += 1
        return contactsCountCall === 1
          ? olderTotal.promise
          : Promise.resolve({ data: { count: 99 } })
      })
      const store = createAnalysisStore({
        api,
        type: "contacts",
        defaultSearchParams: baseSearchParams,
        from,
        to,
      })
      const olderLoad = store.getState().loadAnalysisData()
      const newerFrom = new Date("2026-09-01T00:00:00.000Z")
      const newerTo = new Date("2026-09-10T00:00:00.000Z")

      await store.getState().setRange({ from: newerFrom, to: newerTo })
      expect(store.getState().inboxTotalContacts).toBe(99)
      expect(store.getState().errors.size).toBe(0)
      expect(api.contactsByDimensionAnalyticsAPI).toHaveBeenCalledTimes(3)

      olderTotal.reject(new ORPCError("BAD_REQUEST", { message: "old range" }))
      await olderLoad

      expect(store.getState().inboxTotalContacts).toBe(99)
      expect(store.getState().errors.size).toBe(0)
      expect(store.getState().dashboardLoadStatus.getInboxTotalContacts).toBe(
        "success",
      )
      expect(store.getState().loading).toBe(false)
      expect(api.contactsByDimensionAnalyticsAPI).toHaveBeenCalledTimes(3)
    })

    test("keeps the newest same-range refresh when an older request settles", async () => {
      stubContactsApi()
      const olderTotal = Promise.withResolvers<{ data: { count: number } }>()
      let contactsCountCall = 0
      ;(
        api.contactsCountAnalyticsAPI as ReturnType<typeof vi.fn>
      ).mockImplementation(() => {
        contactsCountCall += 1
        return contactsCountCall === 1
          ? olderTotal.promise
          : Promise.resolve({ data: { count: 99 } })
      })
      const store = createAnalysisStore({
        api,
        type: "contacts",
        defaultSearchParams: baseSearchParams,
        from,
        to,
      })

      const olderLoad = store.getState().loadAnalysisData()
      await store.getState().loadAnalysisData()
      olderTotal.reject(new ORPCError("BAD_REQUEST", { message: "old load" }))
      await olderLoad

      expect(store.getState().inboxTotalContacts).toBe(99)
      expect(store.getState().errors.size).toBe(0)
      expect(store.getState().dashboardLoadStatus.getInboxTotalContacts).toBe(
        "success",
      )
      expect(store.getState().loading).toBe(false)
      expect(api.contactsByDimensionAnalyticsAPI).toHaveBeenCalledTimes(3)
    })

    test("loads only the reflink batch for type: reflinks", async () => {
      ;(api.refLinkStats as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
      })
      ;(api.refLinkContacts as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
        pageCount: 0,
      })

      const store = createAnalysisStore({
        api,
        type: "reflinks",
        defaultSearchParams: {
          workspaceId: "ws-1",
          linkId: "link-1",
          timezone: "UTC",
        },
        from,
        to,
      })

      await store.getState().loadAnalysisData()

      expect(api.refLinkStats).toHaveBeenCalledTimes(1)
      expect(api.refLinkContacts).toHaveBeenCalledTimes(1)
      expect(api.contactCountsPerDayAnalyticsAPI).not.toHaveBeenCalled()
      expect(store.getState().loading).toBe(false)
    })

    test("loads only the magic-link batch for type: magic-links", async () => {
      ;(api.magicLinkStats as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
      })
      ;(api.magicLinkContacts as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
        pageCount: 0,
      })

      const store = createAnalysisStore({
        api,
        type: "magic-links",
        defaultSearchParams: {
          workspaceId: "ws-1",
          linkId: "magic-1",
          timezone: "UTC",
        },
        from,
        to,
      })

      await store.getState().loadAnalysisData()

      expect(api.magicLinkStats).toHaveBeenCalledTimes(1)
      expect(api.magicLinkContacts).toHaveBeenCalledTimes(1)
      expect(api.refLinkStats).not.toHaveBeenCalled()
    })
  })

  describe("comment-automation dashboard", () => {
    const commentSearchParams = {
      workspaceId: "ws-1",
      automationId: "automation-1",
      automationName: "Launch post",
      timezone: "UTC",
    }

    const stubCommentApi = (candidate: ReturnType<typeof buildApi>) => {
      ;(
        candidate.commentAutomationReplyStats as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ data: [{ dateReport: "2026-08-01", count: 3 }] })
      for (const key of [
        "commentAutomationUserComments",
        "commentAutomationBotReplies",
        "commentAutomationErrors",
      ] as const) {
        ;(candidate[key] as ReturnType<typeof vi.fn>).mockResolvedValue({
          data: [],
          total: 0,
          page: 1,
          pageCount: 0,
        })
      }
    }

    test("loadAnalysisData fetches all four panels and none of the dashboard ones", async () => {
      stubCommentApi(api)

      const store = createAnalysisStore({
        api,
        type: "comment-automation",
        defaultSearchParams: commentSearchParams,
        from,
        to,
      })

      await store.getState().loadAnalysisData()

      expect(api.commentAutomationReplyStats).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "ws-1",
          automationId: "automation-1",
          timezone: "UTC",
          startDate: from.toISOString(),
          endDate: to.toISOString(),
        }),
      )
      expect(api.commentAutomationUserComments).toHaveBeenCalledTimes(1)
      expect(api.commentAutomationBotReplies).toHaveBeenCalledTimes(1)
      expect(api.commentAutomationErrors).toHaveBeenCalledTimes(1)
      expect(api.contactCountsPerDayAnalyticsAPI).not.toHaveBeenCalled()
      expect(store.getState().commentAutomationReplyStats).toEqual([
        { dateReport: "2026-08-01", count: 3 },
      ])
      expect(store.getState().loading).toBe(false)
    })

    test("setRange returns every paginated panel to page 1", async () => {
      stubCommentApi(api)

      const store = createAnalysisStore({
        api,
        type: "comment-automation",
        defaultSearchParams: commentSearchParams,
        from,
        to,
      })

      await store.getState().setCommentAutomationUserCommentsPage(3)
      await store.getState().setCommentAutomationBotRepliesPage(2)
      await store.getState().setCommentAutomationErrorsPage(4)

      await store
        .getState()
        .setRange({ from: new Date("2026-09-01"), to: new Date("2026-09-10") })

      expect(store.getState().commentAutomationUserCommentsPage).toBe(1)
      expect(store.getState().commentAutomationBotRepliesPage).toBe(1)
      expect(store.getState().commentAutomationErrorsPage).toBe(1)
    })

    test("a new error-log search resets to page 1 and is sent as the keyword", async () => {
      stubCommentApi(api)

      const store = createAnalysisStore({
        api,
        type: "comment-automation",
        defaultSearchParams: commentSearchParams,
        from,
        to,
      })

      await store.getState().setCommentAutomationErrorsPage(3)
      await store.getState().setCommentAutomationErrorsKeyword("token")

      expect(store.getState().commentAutomationErrorsPage).toBe(1)
      expect(api.commentAutomationErrors).toHaveBeenLastCalledWith(
        expect.objectContaining({ keyword: "token", page: 1 }),
      )
    })

    test("changing page size refetches from page 1 with the new size", async () => {
      stubCommentApi(api)

      const store = createAnalysisStore({
        api,
        type: "comment-automation",
        defaultSearchParams: commentSearchParams,
        from,
        to,
      })

      await store.getState().setCommentAutomationErrorsPage(4)
      await store.getState().setCommentAutomationErrorsPerPage(50)

      // Page 4 of a 10-per-page list is past the end of a 50-per-page one.
      expect(store.getState().commentAutomationErrorsPage).toBe(1)
      expect(store.getState().commentAutomationErrorsPerPage).toBe(50)
      expect(api.commentAutomationErrors).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, perPage: 50 }),
      )
    })

    test("each table keeps its own page size", async () => {
      stubCommentApi(api)

      const store = createAnalysisStore({
        api,
        type: "comment-automation",
        defaultSearchParams: commentSearchParams,
        from,
        to,
      })

      await store.getState().setCommentAutomationUserCommentsPerPage(50)

      expect(store.getState().commentAutomationUserCommentsPerPage).toBe(50)
      expect(store.getState().commentAutomationBotRepliesPerPage).toBe(10)
      expect(store.getState().commentAutomationErrorsPerPage).toBe(10)
    })

    test("stores the total row count each panel reports", async () => {
      stubCommentApi(api)
      ;(
        api.commentAutomationUserComments as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ data: [], total: 37, page: 1, pageCount: 4 })

      const store = createAnalysisStore({
        api,
        type: "comment-automation",
        defaultSearchParams: commentSearchParams,
        from,
        to,
      })

      await store.getState().loadAnalysisData()

      expect(store.getState().commentAutomationUserCommentsTotal).toBe(37)
    })

    test("an empty search sends no keyword rather than an empty string", async () => {
      stubCommentApi(api)

      const store = createAnalysisStore({
        api,
        type: "comment-automation",
        defaultSearchParams: commentSearchParams,
        from,
        to,
      })

      await store.getState().setCommentAutomationErrorsKeyword("")

      expect(api.commentAutomationErrors).toHaveBeenLastCalledWith(
        expect.objectContaining({ keyword: undefined }),
      )
    })
  })
})
