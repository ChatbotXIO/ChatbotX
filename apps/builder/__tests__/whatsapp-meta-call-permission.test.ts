// @vitest-environment node

import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import type { WhatsappCallPermissionsResponse } from "@chatbotx.io/integration-whatsapp/api/calling"
import { beforeEach, describe, expect, test, vi } from "vitest"

const { getCallPermissionsMock, withCacheMock, loggerWarnMock } = vi.hoisted(
  () => ({
    getCallPermissionsMock: vi.fn(),
    withCacheMock: vi.fn(
      async (_key: string, fn: () => Promise<unknown>) => await fn(),
    ),
    loggerWarnMock: vi.fn(),
  }),
)

vi.mock("@chatbotx.io/integration-whatsapp/api/calling", async () => {
  // The real `canPerformCallAction` — this module's whole job is reading the
  // right key out of Meta's response, so stubbing it would test nothing.
  const actual = await vi.importActual<
    typeof import("@chatbotx.io/integration-whatsapp/api/calling")
  >("@chatbotx.io/integration-whatsapp/api/calling")
  return {
    canPerformCallAction: actual.canPerformCallAction,
    getCallPermissions: getCallPermissionsMock,
  }
})

vi.mock("@chatbotx.io/redis", () => ({ withCache: withCacheMock }))

vi.mock("@chatbotx.io/business", () => ({
  callPermissionStatuses: {
    permanent: "permanent",
    temporary: "temporary",
    noPermission: "no_permission",
  },
}))

vi.mock("@/lib/log", () => ({ logger: { warn: loggerWarnMock } }))

const {
  canSendCallPermissionRequest,
  metaCallPermissionCacheKey,
  readMetaCallPermissions,
  toCallPermissionStatus,
} = await import(
  "../src/features/integration-whatsapp/calling/lib/meta-call-permission"
)

// Forwarded untouched to the mocked Graph client, so only its shape matters.
const auth = {
  metadata: { phoneNumber: { id: "pnid-1" } },
} as unknown as WhatsappAuthValue

const read = () =>
  readMetaCallPermissions({
    auth,
    integrationId: "integration-1",
    contactInboxId: "contact-inbox-1",
    target: { userWaId: "84349566550" },
  })

describe("meta-call-permission", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    withCacheMock.mockImplementation(
      async (_key: string, fn: () => Promise<unknown>) => await fn(),
    )
  })

  test("caches per integration AND contact inbox — the same contact on another number is a different answer", () => {
    expect(metaCallPermissionCacheKey("integration-1", "contact-inbox-1")).toBe(
      "whatsapp-call-permissions:integration-1:contact-inbox-1",
    )
    expect(
      metaCallPermissionCacheKey("integration-2", "contact-inbox-1"),
    ).not.toBe(metaCallPermissionCacheKey("integration-1", "contact-inbox-1"))
  })

  test("a failed lookup resolves undefined instead of throwing into the caller's request", async () => {
    getCallPermissionsMock.mockRejectedValue(new Error("meta down"))

    await expect(read()).resolves.toBeUndefined()
    expect(loggerWarnMock).toHaveBeenCalled()
  })

  test.each([
    ["no_permission", "no_permission"],
    ["temporary", "temporary"],
    ["permanent", "permanent"],
  ])("maps Meta's %s status onto the mirror's vocabulary", (meta, local) => {
    expect(
      toCallPermissionStatus({
        messaging_product: "whatsapp",
        permission: {
          status: meta as "no_permission" | "temporary" | "permanent",
        },
        actions: [],
      }),
    ).toBe(local)
  })

  test.each([
    [
      "an unmapped status",
      { messaging_product: "whatsapp", permission: { status: "revoked" } },
    ],
    ["no permission object at all", { messaging_product: "whatsapp" }],
  ])("degrades %s to undefined rather than throwing", (_label, response) => {
    expect(
      toCallPermissionStatus({
        ...response,
        actions: [],
      } as unknown as WhatsappCallPermissionsResponse),
    ).toBeUndefined()
  })

  test("request budget is read off Meta's own action flag, not a counter of ours", () => {
    const withBudget = {
      messaging_product: "whatsapp" as const,
      permission: { status: "no_permission" as const },
      actions: [
        {
          action_name: "send_call_permission_request" as const,
          can_perform_action: true,
          limits: [{ time_period: "P7D", max_allowed: 2, current_usage: 1 }],
        },
      ],
    }
    expect(canSendCallPermissionRequest(withBudget)).toBe(true)

    const spent = {
      ...withBudget,
      actions: [
        {
          action_name: "send_call_permission_request" as const,
          can_perform_action: false,
          limits: [
            {
              time_period: "P7D",
              max_allowed: 2,
              current_usage: 2,
              limit_expiration_time: 1_790_000_000,
            },
          ],
        },
      ],
    }
    expect(canSendCallPermissionRequest(spent)).toBe(false)
  })

  test("an action Meta did not report at all is treated as no budget", () => {
    expect(
      canSendCallPermissionRequest({
        messaging_product: "whatsapp",
        permission: { status: "no_permission" },
        actions: [{ action_name: "start_call", can_perform_action: true }],
      }),
    ).toBe(false)
  })
})
