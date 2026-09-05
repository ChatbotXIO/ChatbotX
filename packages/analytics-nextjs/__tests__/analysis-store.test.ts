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

  describe("loadAnalysisData / initialize / setRange", () => {
    const resolveEveryDashboardStat = () => {
      const arrayResult = { data: [] }
      const countResult = { data: { count: 0 } }
      api.contactCountsPerDayAnalyticsAPI = vi
        .fn()
        .mockResolvedValue(arrayResult)
      api.newContactCountsPerDayAnalyticsAPI = vi
        .fn()
        .mockResolvedValue(arrayResult)
      api.blockedContactsPerDayAnalyticsAPI = vi
        .fn()
        .mockResolvedValue(arrayResult)
      api.contactsCountAnalyticsAPI = vi.fn().mockResolvedValue(countResult)
      api.newContactsCountAnalyticsAPI = vi.fn().mockResolvedValue(countResult)
      api.activeContactsCountAnalyticsAPI = vi
        .fn()
        .mockResolvedValue(countResult)
      api.blockedContactsCountAnalyticsAPI = vi
        .fn()
        .mockResolvedValue(countResult)
      api.botMessagesByResultAnalyticsAPI = vi
        .fn()
        .mockResolvedValue(arrayResult)
      api.botMessagesAIProvidersAnalyticsAPI = vi
        .fn()
        .mockResolvedValue(arrayResult)
      api.messagesBySenderAnalyticsAPI = vi.fn().mockResolvedValue(arrayResult)
      api.contactsByDimensionAnalyticsAPI = vi
        .fn()
        .mockResolvedValue(arrayResult)
      api.conversationHandoffsAnalyticsAPI = vi
        .fn()
        .mockResolvedValue(arrayResult)
      api.conversationFollowUpsAnalyticsAPI = vi
        .fn()
        .mockResolvedValue(arrayResult)
      api.conversationArchivedAnalyticsAPI = vi
        .fn()
        .mockResolvedValue(arrayResult)
      api.conversationAssignedAnalyticsAPI = vi
        .fn()
        .mockResolvedValue(arrayResult)
      api.conversationAssignedByAdminAnalyticsAPI = vi
        .fn()
        .mockResolvedValue(arrayResult)
      api.uniqueConversationsByAdminAnalyticsAPI = vi
        .fn()
        .mockResolvedValue(arrayResult)
      api.messagesByAdminAnalyticsAPI = vi.fn().mockResolvedValue(arrayResult)
      api.botMessagesWithResponseAnalyticsAPI = vi
        .fn()
        .mockResolvedValue(arrayResult)
      api.botMessagesNoResponseAnalyticsAPI = vi
        .fn()
        .mockResolvedValue(arrayResult)
      api.humanAgentStatsAnalyticsAPI = vi.fn().mockResolvedValue(arrayResult)
    }

    test("loadAnalysisData fetches the dashboard batch and toggles loading for type: dashboard", async () => {
      resolveEveryDashboardStat()

      const store = createAnalysisStore({
        api,
        type: "dashboard",
        defaultSearchParams: baseSearchParams,
        from,
        to,
      })

      const loadPromise = store.getState().loadAnalysisData()
      expect(store.getState().loading).toBe(true)

      await loadPromise

      expect(store.getState().loading).toBe(false)
      expect(api.contactCountsPerDayAnalyticsAPI).toHaveBeenCalledTimes(1)
      expect(api.humanAgentStatsAnalyticsAPI).toHaveBeenCalledTimes(1)
      // Reflink/magic-link-only endpoints must not be called for the dashboard type.
      expect(api.refLinkStats).not.toHaveBeenCalled()
      expect(api.magicLinkStats).not.toHaveBeenCalled()
    })

    test("loadAnalysisData fetches only the reflink batch for type: reflinks", async () => {
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

    test("loadAnalysisData fetches only the magic-link batch for type: magic-links", async () => {
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

    test("initialize delegates to loadAnalysisData", async () => {
      resolveEveryDashboardStat()

      const store = createAnalysisStore({
        api,
        type: "dashboard",
        defaultSearchParams: baseSearchParams,
        from,
        to,
      })

      await store.getState().initialize()

      expect(api.contactCountsPerDayAnalyticsAPI).toHaveBeenCalledTimes(1)
    })

    test("setRange updates from/to then reloads analysis data with the new range", async () => {
      resolveEveryDashboardStat()

      const store = createAnalysisStore({
        api,
        type: "dashboard",
        defaultSearchParams: baseSearchParams,
        from,
        to,
      })

      const nextFrom = new Date("2026-09-01T00:00:00.000Z")
      const nextTo = new Date("2026-09-10T00:00:00.000Z")

      await store.getState().setRange({ from: nextFrom, to: nextTo })

      expect(store.getState().from).toBe(nextFrom)
      expect(store.getState().to).toBe(nextTo)
      expect(api.contactCountsPerDayAnalyticsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          from: nextFrom.toISOString(),
          to: nextTo.toISOString(),
        }),
      )
    })
  })
})
