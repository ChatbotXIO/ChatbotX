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
