import { readFileSync } from "node:fs"
import { IntegrationJobAction } from "@chatbotx.io/worker-config"
import { describe, expect, test } from "vitest"
import { isChannelOriginatedJob } from "../src/integration/channel-origin"

describe("conversation routing queue types", () => {
  test("threadControlEvent and threadControlAction are integration job actions", () => {
    expect(IntegrationJobAction.threadControlEvent).toBe("threadControlEvent")
    expect(IntegrationJobAction.threadControlAction).toBe("threadControlAction")
  })

  test("the WhatsApp webhook enqueues under the action name the worker switches on", () => {
    // The integration package cannot import worker-config, so it repeats the
    // literal; this pins both ends to the same string.
    const source = readFileSync(
      "../../integrations/whatsapp/src/lib/conversation-routing.ts",
      "utf8",
    )

    expect(source).toContain(
      `THREAD_CONTROL_EVENT_JOB_NAME = "${IntegrationJobAction.threadControlEvent}"`,
    )
  })

  test("a routing webhook item is channel-originated, an archive release is internal", () => {
    expect(
      isChannelOriginatedJob({
        type: IntegrationJobAction.threadControlEvent,
        data: {
          integrationType: "whatsapp",
          integrationIdentifier: "phone-1",
          payload: {},
        },
      }),
    ).toBe(true)
    expect(
      isChannelOriginatedJob({
        type: IntegrationJobAction.threadControlAction,
        data: {
          workspaceId: "ws-1",
          contactInboxId: "ci-1",
          conversationId: "conv-1",
          action: "release",
        },
      }),
    ).toBe(false)
  })
})
