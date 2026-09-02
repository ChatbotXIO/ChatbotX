import type {
  ContactInboxModel,
  ContactModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { formatBotFieldReference } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockBotFieldFindMany,
  mockContactCustomFieldFindMany,
  mockContactFindFirst,
} = vi.hoisted(() => ({
  mockBotFieldFindMany: vi.fn(),
  mockContactCustomFieldFindMany: vi.fn().mockResolvedValue([]),
  mockContactFindFirst: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  botFieldWorkspaceCacheTags: (workspaceId: string) => [
    "bot-fields",
    `bot-fields:${workspaceId}`,
  ],
  appointmentService: { findBy: vi.fn() },
  contactInboxService: {
    findLatestLastIncomingMessageAtByContactId: vi.fn(),
  },
  messageService: { listIncomingTextsByContactInbox: vi.fn() },
  resolveTenantSettings: vi.fn(),
  workspaceService: { find: vi.fn() },
}))

vi.mock("@chatbotx.io/business/utils", () => ({
  getPublicFileUrl: (path: string, baseUrl: string) =>
    new URL(path, baseUrl).toString(),
}))

vi.mock("@chatbotx.io/business/coupon", () => ({
  couponService: { resolveCouponVariable: vi.fn() },
}))

// Pass-through cache (partial mock: the business import chain also pulls
// other redis exports, e.g. bloomFilter): each test's mocked bot-field rows
// must flow fresh through withCache.
vi.mock("@chatbotx.io/redis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/redis")>()),
  withCache: async (_key: string, fn: () => Promise<unknown>) => fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      contactModel: { findFirst: mockContactFindFirst },
      contactInboxModel: { findFirst: vi.fn() },
      contactCustomFieldModel: { findMany: mockContactCustomFieldFindMany },
      botFieldModel: { findMany: mockBotFieldFindMany },
    },
  },
}))

const { resolveContactVariablesDeep } = await import(
  "../src/deep-replace-contact-variables"
)

beforeEach(() => {
  vi.clearAllMocks()
  mockContactCustomFieldFindMany.mockResolvedValue([])
})

const contact = {
  id: "contact-1",
  workspaceId: "workspace-1",
  firstName: "Ada",
  locale: null,
  timezone: "UTC",
} as ContactModel

const contactInbox = { id: "contact-inbox-1" } as ContactInboxModel

const workspace = { id: "workspace-1", timezone: "UTC" } as WorkspaceModel

describe("resolveContactVariablesDeep bot fields", () => {
  test("resolves a bot_field:<id> token nested inside an object structure", async () => {
    mockContactFindFirst.mockResolvedValue(contact)
    mockBotFieldFindMany.mockResolvedValue([
      { id: "1", type: "shortText", value: "9am - 5pm" },
    ])

    const result = await resolveContactVariablesDeep(
      "contact-1",
      { message: `Hours: {{${formatBotFieldReference("1")}}}` },
      { contactInbox, workspace },
    )

    expect(result).toEqual({ message: "Hours: 9am - 5pm" })
    expect(mockBotFieldFindMany).toHaveBeenCalledWith({
      where: { workspaceId: "workspace-1" },
    })
  })

  test("returns the input unchanged, without loading contact data, when it has no {{ placeholder", async () => {
    const result = await resolveContactVariablesDeep(
      "contact-1",
      { message: "No variables here" },
      { contactInbox, workspace },
    )

    expect(result).toEqual({ message: "No variables here" })
    expect(mockContactFindFirst).not.toHaveBeenCalled()
    expect(mockBotFieldFindMany).not.toHaveBeenCalled()
  })

  // Deep-freezes every object/array in the structure so an in-place mutation
  // (e.g. `value[key] = ...` instead of building a new container) throws
  // immediately in strict mode, instead of only being caught later, via a
  // separate equality check, if at all.
  const deepFreeze = <T>(value: T): T => {
    if (Array.isArray(value)) {
      for (const item of value) {
        deepFreeze(item)
      }
      return Object.freeze(value)
    }
    if (value !== null && typeof value === "object") {
      for (const nested of Object.values(value)) {
        deepFreeze(nested)
      }
      return Object.freeze(value)
    }
    return value
  }

  test("resolves known tokens at every depth of a realistic nested payload, leaves an unknown bot field literal, and never mutates the source object", async () => {
    mockContactFindFirst.mockResolvedValue(contact)
    mockContactCustomFieldFindMany.mockResolvedValue([
      {
        value: "Acme Inc",
        customField: {
          name: "company",
          type: "shortText",
          description: "",
        },
      },
    ])
    mockBotFieldFindMany.mockResolvedValue([
      { id: "1", type: "shortText", value: "Enterprise Plan" },
    ])

    const knownBotFieldToken = `{{${formatBotFieldReference("1")}}}`
    const unknownBotFieldToken = `{{${formatBotFieldReference("999")}}}`

    // Mirrors a real webhook jsonBody / tool-call payload: nested objects
    // 3+ levels deep, arrays of strings, and an array of objects — mixing a
    // known contact-field token, a known bot-field token, and an unknown one.
    const buildPayload = () => ({
      event: "order.created",
      headers: {
        "x-workspace": "workspace-1",
      },
      jsonBody: {
        customer: {
          greeting: "Hi {{company}}",
          tags: ["vip", `Plan: ${knownBotFieldToken}`],
        },
        items: [
          { sku: "SKU-1", note: `Legacy note: ${unknownBotFieldToken}` },
          { sku: "SKU-2", note: "no variables here" },
        ],
      },
      meta: null,
    })

    const input = deepFreeze(buildPayload())
    const snapshotBeforeCall = buildPayload()

    const result = await resolveContactVariablesDeep("contact-1", input, {
      contactInbox,
      workspace,
    })

    expect(result).toEqual({
      event: "order.created",
      headers: {
        "x-workspace": "workspace-1",
      },
      jsonBody: {
        customer: {
          greeting: "Hi Acme Inc",
          tags: ["vip", "Plan: Enterprise Plan"],
        },
        items: [
          { sku: "SKU-1", note: `Legacy note: ${unknownBotFieldToken}` },
          { sku: "SKU-2", note: "no variables here" },
        ],
      },
      meta: null,
    })
    // The frozen source is untouched — still exactly what it was before the call.
    expect(input).toEqual(snapshotBeforeCall)
    // And the result is a distinct object graph, not the (frozen) input handed back.
    expect(result).not.toBe(input)
    expect(result.jsonBody).not.toBe(input.jsonBody)
  })
})
