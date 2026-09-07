// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// contactService.list (packages/business/src/contact/list.ts)
//
// Covers:
//  - scope.canViewEmailAndPhone=false masks email/phone on every row and
//    forwards includeEmailAndPhone:false + restrictToAssignedUserId to
//    buildListWhere.
//  - unscoped calls (scope: UNSCOPED) never mask.
//  - withCount:false skips the count round-trip entirely (totalCount: 0).
//  - the O1 projection/relation optimization: listForTable is used for
//    projection:"table", or when `include` omits both "tags" and
//    "customFields"; listWithRelations is used otherwise (include omitted,
//    or include contains "tags"/"customFields").
// ---------------------------------------------------------------------------

const { contactRepository } = await import("@chatbotx.io/database/repositories")
const { list, UNSCOPED } = await import("../src/contact/list")

const where = { workspaceId: "ws-1" }
const orderBy = { createdAt: "desc" }

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(contactRepository, "buildListWhere").mockReturnValue(where as never)
  vi.spyOn(contactRepository, "resolveOrderBy").mockReturnValue(
    orderBy as never,
  )
  vi.spyOn(contactRepository, "listForTable").mockResolvedValue([] as never)
  vi.spyOn(contactRepository, "listWithRelations").mockResolvedValue(
    [] as never,
  )
  vi.spyOn(contactRepository, "countCapped").mockResolvedValue({
    total: 0,
    capped: false,
  } as never)
})

describe("contactService.list", () => {
  test("scope.canViewEmailAndPhone=false masks email/phone and forwards includeEmailAndPhone:false + restrictToAssignedUserId", async () => {
    const rows = [
      {
        id: "contact-1",
        email: "ada@example.com",
        phoneNumber: "+15551234567",
      },
      {
        id: "contact-2",
        email: "bob@example.com",
        phoneNumber: "+15557654321",
      },
    ]
    vi.spyOn(contactRepository, "listWithRelations").mockResolvedValue(
      rows as never,
    )

    const result = await list({
      workspaceId: "ws-1",
      scope: {
        canViewEmailAndPhone: false,
        restrictToAssignedUserId: "user-1",
      },
    })

    expect(result.data).toEqual([
      { id: "contact-1", email: null, phoneNumber: null },
      { id: "contact-2", email: null, phoneNumber: null },
    ])
    expect(contactRepository.buildListWhere).toHaveBeenCalledWith(
      expect.objectContaining({
        includeEmailAndPhone: false,
        restrictToAssignedUserId: "user-1",
      }),
    )
  })

  test("unscoped call (scope: UNSCOPED) does not mask email/phone", async () => {
    const rows = [
      {
        id: "contact-1",
        email: "ada@example.com",
        phoneNumber: "+15551234567",
      },
    ]
    vi.spyOn(contactRepository, "listWithRelations").mockResolvedValue(
      rows as never,
    )

    const result = await list({ workspaceId: "ws-1", scope: UNSCOPED })

    expect(result.data).toEqual(rows)
    expect(contactRepository.buildListWhere).toHaveBeenCalledWith(
      expect.objectContaining({
        includeEmailAndPhone: true,
        restrictToAssignedUserId: undefined,
      }),
    )
  })

  test("withCount:false skips the count round-trip and returns totalCount: 0", async () => {
    const countSpy = vi.spyOn(contactRepository, "countCapped")

    const result = await list({
      workspaceId: "ws-1",
      scope: UNSCOPED,
      withCount: false,
    })

    expect(countSpy).not.toHaveBeenCalled()
    expect(result.totalCount).toBe(0)
    expect(result.totalCountCapped).toBe(false)
    expect(result.pageCount).toBe(0)
  })

  test("projection:'table' uses listForTable, not listWithRelations", async () => {
    const tableSpy = vi.spyOn(contactRepository, "listForTable")
    const relationsSpy = vi.spyOn(contactRepository, "listWithRelations")

    await list({ workspaceId: "ws-1", scope: UNSCOPED, projection: "table" })

    expect(tableSpy).toHaveBeenCalledTimes(1)
    expect(relationsSpy).not.toHaveBeenCalled()
  })

  test("include omitting both 'tags' and 'customFields' uses listForTable", async () => {
    const tableSpy = vi.spyOn(contactRepository, "listForTable")
    const relationsSpy = vi.spyOn(contactRepository, "listWithRelations")

    await list({ workspaceId: "ws-1", scope: UNSCOPED, include: ["inboxes"] })

    expect(tableSpy).toHaveBeenCalledTimes(1)
    expect(relationsSpy).not.toHaveBeenCalled()
  })

  test("include containing 'tags' uses listWithRelations", async () => {
    const tableSpy = vi.spyOn(contactRepository, "listForTable")
    const relationsSpy = vi.spyOn(contactRepository, "listWithRelations")

    await list({ workspaceId: "ws-1", scope: UNSCOPED, include: ["tags"] })

    expect(relationsSpy).toHaveBeenCalledTimes(1)
    expect(tableSpy).not.toHaveBeenCalled()
  })

  test("include containing 'customFields' uses listWithRelations", async () => {
    const tableSpy = vi.spyOn(contactRepository, "listForTable")
    const relationsSpy = vi.spyOn(contactRepository, "listWithRelations")

    await list({
      workspaceId: "ws-1",
      scope: UNSCOPED,
      include: ["customFields"],
    })

    expect(relationsSpy).toHaveBeenCalledTimes(1)
    expect(tableSpy).not.toHaveBeenCalled()
  })

  test("include omitted entirely uses listWithRelations (default full relation set)", async () => {
    const tableSpy = vi.spyOn(contactRepository, "listForTable")
    const relationsSpy = vi.spyOn(contactRepository, "listWithRelations")

    await list({ workspaceId: "ws-1", scope: UNSCOPED })

    expect(relationsSpy).toHaveBeenCalledTimes(1)
    expect(tableSpy).not.toHaveBeenCalled()
  })
})
