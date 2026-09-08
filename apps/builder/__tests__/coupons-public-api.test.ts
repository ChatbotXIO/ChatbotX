import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

type CapturedProcedure = {
  route: RouteConfig
  handler?: (...args: any[]) => any
}

const { workspaceTokenAuthAPIForScope, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []

  const makeProcedure = (route: RouteConfig) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)

    const chain = {
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      errors: vi.fn(() => chain),
      handler: vi.fn((fn: (...args: any[]) => any) => {
        record.handler = fn
        return { handler: fn }
      }),
    }
    return chain
  }

  const workspaceTokenAuthAPI = {
    route: vi.fn((config: RouteConfig) => makeProcedure(config)),
  }

  return {
    workspaceTokenAuthAPIForScope: vi.fn(
      (_scope: string) => workspaceTokenAuthAPI,
    ),
    capturedProcedures,
  }
})

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

const couponService = {
  listTopics: vi.fn(),
  getTopic: vi.fn(),
  createTopic: vi.fn(),
  updateTopic: vi.fn(),
  archiveTopic: vi.fn(),
  unarchiveTopic: vi.fn(),
  deleteTopic: vi.fn(),
  listCoupons: vi.fn(),
  issueCoupon: vi.fn(),
  markCouponUsed: vi.fn(),
  listIssuedCouponsForContact: vi.fn(),
}
const contactService = { findByIdOrFail: vi.fn() }

vi.mock("@chatbotx.io/business", () => ({ couponService, contactService }))

await import("@/features/coupons/api/public")

const findProcedure = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (p) => p.route.method === method && p.route.path === path,
  )
  if (!found) {
    throw new Error(`No procedure registered for ${method} ${path}`)
  }
  return found
}

const scopeArgAtImport = workspaceTokenAuthAPIForScope.mock.calls[0]?.[0]

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers the coupons public router under the ecommerce scope", () => {
  expect(scopeArgAtImport).toBe("ecommerce")
})

describe("POST /v1/coupon-topics", () => {
  const procedure = findProcedure("POST", "/v1/coupon-topics")

  test("creates a topic with no createdById — workspace tokens have no user", async () => {
    couponService.createTopic.mockResolvedValueOnce({ id: "t-1" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { name: "Summer sale" },
    })

    expect(couponService.createTopic).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      createdById: null,
      name: "Summer sale",
    })
  })
})

describe("POST /v1/coupon-topics/{id}/issue", () => {
  const procedure = findProcedure("POST", "/v1/coupon-topics/{id}/issue")

  test("returns the coupon on success", async () => {
    contactService.findByIdOrFail.mockResolvedValueOnce({ id: "contact-1" })
    couponService.issueCoupon.mockResolvedValueOnce({
      ok: true,
      reason: "issued",
      coupon: { id: "cpn-1", code: "SAVE10" },
    })

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { id: "t-1", contactId: "contact-1" },
      }),
    ).resolves.toEqual({ id: "cpn-1", code: "SAVE10" })

    expect(couponService.issueCoupon).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      topicId: "t-1",
      contactId: "contact-1",
    })
  })

  // The coupon row is workspace-scoped but `issuedContactId` is written
  // unchecked, so a contact from another workspace must never reach it.
  test("404s before issuing when the contact belongs to another workspace", async () => {
    contactService.findByIdOrFail.mockRejectedValueOnce(
      new Error("Contact not found"),
    )

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { id: "t-1", contactId: "foreign-contact" },
      }),
    ).rejects.toThrow("Contact not found")

    expect(contactService.findByIdOrFail).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "foreign-contact",
    })
    expect(couponService.issueCoupon).not.toHaveBeenCalled()
  })

  test("throws couponIssueUnavailable with the reason when no coupon is available", async () => {
    couponService.issueCoupon.mockResolvedValueOnce({
      ok: false,
      reason: "noAvailableCoupon",
      coupon: null,
    })

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { id: "t-1", contactId: "contact-1" },
      }),
    ).rejects.toMatchObject({
      code: "couponIssueUnavailable",
      data: { reason: "noAvailableCoupon" },
    })
  })
})

describe("POST /v1/coupon-topics/{id}/mark-used", () => {
  const procedure = findProcedure("POST", "/v1/coupon-topics/{id}/mark-used")

  test("throws couponNotIssued when the contact has no issued coupon", async () => {
    contactService.findByIdOrFail.mockResolvedValueOnce({ id: "contact-1" })
    couponService.markCouponUsed.mockResolvedValueOnce({
      ok: false,
      reason: "noIssuedCoupon",
      coupon: null,
    })

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { id: "t-1", contactId: "contact-1" },
      }),
    ).rejects.toMatchObject({
      code: "couponNotIssued",
      data: { reason: "noIssuedCoupon" },
    })
  })

  test("returns the coupon once marked used", async () => {
    contactService.findByIdOrFail.mockResolvedValueOnce({ id: "contact-1" })
    couponService.markCouponUsed.mockResolvedValueOnce({
      ok: true,
      reason: "markedUsed",
      coupon: { id: "cpn-1", code: "SAVE10" },
    })

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { id: "t-1", contactId: "contact-1" },
      }),
    ).resolves.toEqual({ id: "cpn-1", code: "SAVE10" })

    expect(couponService.markCouponUsed).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      topicId: "t-1",
      contactId: "contact-1",
    })
  })

  test("404s before marking used when the contact belongs to another workspace", async () => {
    contactService.findByIdOrFail.mockRejectedValueOnce(
      new Error("Contact not found"),
    )

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { id: "t-1", contactId: "foreign-contact" },
      }),
    ).rejects.toThrow("Contact not found")

    expect(couponService.markCouponUsed).not.toHaveBeenCalled()
  })
})

describe("GET /v1/contacts/{contactId}/coupons", () => {
  const procedure = findProcedure("GET", "/v1/contacts/{contactId}/coupons")

  test("404s when the contact does not exist", async () => {
    contactService.findByIdOrFail.mockRejectedValueOnce(
      new Error("Contact not found"),
    )

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { contactId: "missing" },
      }),
    ).rejects.toThrow("Contact not found")

    expect(couponService.listIssuedCouponsForContact).not.toHaveBeenCalled()
  })

  test("lists coupons issued to the contact", async () => {
    contactService.findByIdOrFail.mockResolvedValueOnce({ id: "contact-1" })
    couponService.listIssuedCouponsForContact.mockResolvedValueOnce([
      { id: "cpn-1" },
    ])

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { contactId: "contact-1" },
      }),
    ).resolves.toEqual({ data: [{ id: "cpn-1" }] })

    expect(couponService.listIssuedCouponsForContact).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
    })
  })
})

describe("coupon topic routes forward workspace-scoped arguments", () => {
  test("GET /v1/coupon-topics lists topics with paging", async () => {
    couponService.listTopics.mockResolvedValueOnce({
      data: [{ id: "t-1", couponCount: 3 }],
      pageCount: 2,
    })

    await expect(
      findProcedure("GET", "/v1/coupon-topics").handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { page: 1, perPage: 50, archived: false },
      }),
    ).resolves.toEqual({ data: [{ id: "t-1", couponCount: 3 }], pageCount: 2 })

    expect(couponService.listTopics).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      page: 1,
      perPage: 50,
      archived: false,
    })
  })

  test("GET /v1/coupon-topics/{id} fetches one topic", async () => {
    couponService.getTopic.mockResolvedValueOnce({ id: "t-1" })

    await expect(
      findProcedure("GET", "/v1/coupon-topics/{id}").handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { id: "t-1" },
      }),
    ).resolves.toEqual({ id: "t-1" })

    expect(couponService.getTopic).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      topicId: "t-1",
    })
  })

  test("PATCH /v1/coupon-topics/{id} maps id to topicId", async () => {
    couponService.updateTopic.mockResolvedValueOnce({ id: "t-1" })

    await findProcedure("PATCH", "/v1/coupon-topics/{id}").handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "t-1", name: "Renamed" },
    })

    expect(couponService.updateTopic).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      topicId: "t-1",
      name: "Renamed",
    })
  })

  test.each([
    ["/v1/coupon-topics/{id}/archive", "archiveTopic"],
    ["/v1/coupon-topics/{id}/unarchive", "unarchiveTopic"],
  ] as const)("POST %s calls %s", async (path, method) => {
    couponService[method].mockResolvedValueOnce({ id: "t-1" })

    await findProcedure("POST", path).handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "t-1" },
    })

    expect(couponService[method]).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      topicId: "t-1",
    })
  })

  test("DELETE /v1/coupon-topics/{id} deletes the topic", async () => {
    couponService.deleteTopic.mockResolvedValueOnce({ id: "t-1" })

    await findProcedure("DELETE", "/v1/coupon-topics/{id}").handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "t-1" },
    })

    expect(couponService.deleteTopic).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      topicId: "t-1",
    })
  })

  test("GET /v1/coupons lists coupons with filters", async () => {
    couponService.listCoupons.mockResolvedValueOnce({
      data: [{ id: "cpn-1" }],
      pageCount: 1,
    })

    await expect(
      findProcedure("GET", "/v1/coupons").handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { page: 1, perPage: 50, topicId: "t-1" },
      }),
    ).resolves.toEqual({ data: [{ id: "cpn-1" }], pageCount: 1 })

    expect(couponService.listCoupons).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      page: 1,
      perPage: 50,
      topicId: "t-1",
    })
  })
})
