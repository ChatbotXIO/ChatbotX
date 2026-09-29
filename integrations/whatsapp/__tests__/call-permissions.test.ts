import { describe, expect, test } from "vitest"
import {
  canPerformCallAction,
  type WhatsappCallPermissionsResponse,
} from "../src/api/calling"

/**
 * Meta's `GET /{pnid}/call_permissions` example response uses
 * `can_perform_action`, confirmed against Meta's calling permissions
 * reference. This fixture is built from that example so
 * `canPerformCallAction` is proven against the real shape, not just an
 * assumption.
 */
const metaExampleResponse = (): WhatsappCallPermissionsResponse => ({
  messaging_product: "whatsapp",
  permission: {
    status: "temporary",
    expiration_time: 1_745_343_479,
  },
  actions: [
    {
      action_name: "send_call_permission_request",
      can_perform_action: true,
      limits: [
        { time_period: "PT24H", max_allowed: 1, current_usage: 0 },
        { time_period: "P7D", max_allowed: 2, current_usage: 1 },
      ],
    },
    {
      action_name: "start_call",
      can_perform_action: false,
      limits: [
        {
          time_period: "PT24H",
          max_allowed: 5,
          current_usage: 5,
          limit_expiration_time: 1_745_622_600,
        },
      ],
    },
  ],
})

/** A hypothetical legacy shape carrying only the old (incorrect) key. */
const legacyShapeResponse = (): WhatsappCallPermissionsResponse => ({
  messaging_product: "whatsapp",
  permission: { status: "permanent" },
  actions: [
    {
      action_name: "start_call",
      can_perform: true,
    },
  ],
})

describe("canPerformCallAction", () => {
  test("reads Meta's documented can_perform_action field", () => {
    const response = metaExampleResponse()

    expect(canPerformCallAction(response, "send_call_permission_request")).toBe(
      true,
    )
    expect(canPerformCallAction(response, "start_call")).toBe(false)
  })

  test("falls back to the legacy can_perform field when can_perform_action is absent", () => {
    expect(canPerformCallAction(legacyShapeResponse(), "start_call")).toBe(true)
  })

  test("returns false when no action entries are present", () => {
    expect(
      canPerformCallAction(
        {
          messaging_product: "whatsapp",
          permission: { status: "no_permission" },
          actions: [],
        },
        "start_call",
      ),
    ).toBe(false)
  })
})
