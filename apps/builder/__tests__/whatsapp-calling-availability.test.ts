import { describe, expect, test } from "vitest"
import {
  isCallingAvailableForConversation,
  selectCallingEnabledInboxIds,
} from "@/features/integration-whatsapp/calling/softphone/calling-availability"

type Inbox = Parameters<typeof selectCallingEnabledInboxIds>[0][number]

const inbox = (id: string, sipProvisioningStatus: string | undefined): Inbox =>
  ({
    id,
    channel: "whatsapp",
    integrationWhatsapp: sipProvisioningStatus
      ? { sipProvisioningStatus }
      : null,
  }) as unknown as Inbox

describe("selectCallingEnabledInboxIds", () => {
  test("keeps only inboxes whose WhatsApp number is fully enabled for SIP", () => {
    const ids = selectCallingEnabledInboxIds([
      inbox("enabled-1", "enabled"),
      inbox("provisioned-only", "provisioned"),
      inbox("none", "none"),
      inbox("failed", "failed"),
      inbox("messenger", undefined),
    ])

    expect([...ids]).toEqual(["enabled-1"])
  })
})

describe("isCallingAvailableForConversation", () => {
  const enabled = new Set(["inbox-a"])

  test("is true when a contact inbox belongs to an enabled inbox", () => {
    expect(
      isCallingAvailableForConversation(
        [{ inboxId: "inbox-z" }, { inboxId: "inbox-a" }],
        enabled,
      ),
    ).toBe(true)
  })

  test("is false for a WhatsApp inbox that is only provisioned", () => {
    expect(
      isCallingAvailableForConversation([{ inboxId: "inbox-z" }], enabled),
    ).toBe(false)
  })

  test("is false when the conversation has no contact inboxes yet", () => {
    expect(isCallingAvailableForConversation(undefined, enabled)).toBe(false)
  })
})
