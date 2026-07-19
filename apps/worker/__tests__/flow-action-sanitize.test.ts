import { encodeButtonPayload } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import {
  type FlowActionContext,
  sanitizeFlowAction,
} from "../src/integration/handlers/flow-action"

const context = (
  overrides: Partial<FlowActionContext> = {},
): FlowActionContext => ({
  kind: "postback",
  integrationType: "messenger",
  integrationIdentifier: "page-1",
  ...overrides,
})

const BARE_FLOW_ID = "1783440960229"

describe("sanitizeFlowAction bare flow ID", () => {
  test("numeric payload passes for messenger postback", () => {
    expect(sanitizeFlowAction(BARE_FLOW_ID, context())).toBe(BARE_FLOW_ID)
  })

  test("numeric payload passes for messenger quick reply", () => {
    expect(
      sanitizeFlowAction(BARE_FLOW_ID, context({ kind: "quickReply" })),
    ).toBe(BARE_FLOW_ID)
  })

  test("numeric payload is dropped for other channels", () => {
    for (const integrationType of ["telegram", "zalo", "tiktok", "whatsapp"]) {
      expect(
        sanitizeFlowAction(BARE_FLOW_ID, context({ integrationType })),
      ).toBeNull()
      expect(
        sanitizeFlowAction(
          BARE_FLOW_ID,
          context({ integrationType, kind: "quickReply" }),
        ),
      ).toBeNull()
    }
  })

  test("encoded payloads pass on every channel", () => {
    const encoded = encodeButtonPayload({ flowId: "123", buttonId: "789" })
    for (const integrationType of ["messenger", "telegram", "whatsapp"]) {
      expect(sanitizeFlowAction(encoded, context({ integrationType }))).toBe(
        encoded,
      )
    }
  })

  test("undecodable payloads are still dropped on messenger", () => {
    expect(sanitizeFlowAction("not-a-payload", context())).toBeNull()
    expect(sanitizeFlowAction(null, context())).toBeNull()
  })
})
