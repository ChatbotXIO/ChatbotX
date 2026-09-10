import { describe, expect, test } from "vitest"
import {
  BROADCAST_OUTCOME_GRACE_MS,
  broadcastChannelCapabilities,
  broadcastStatuses,
  broadcastSubactionAudienceRules,
  broadcastSubactions,
  findBroadcastChannelCapability,
  isBroadcastOutcomeGraceElapsed,
  isTargetsFlowSendWithoutFlow,
  isTargetsTemplateSendWithoutTemplate,
  requiresRecentInteractionWindow,
  resolveBroadcastTerminalStatus,
} from "../src/partials/broadcast"

describe("requiresRecentInteractionWindow", () => {
  test("requires the 24h messaging window for non-template Messenger and WhatsApp broadcast subactions", () => {
    expect(
      requiresRecentInteractionWindow(
        broadcastSubactions.enum.messengerActiveContacts,
      ),
    ).toBe(true)
    expect(
      requiresRecentInteractionWindow(
        broadcastSubactions.enum.whatsappWithin24Hours,
      ),
    ).toBe(true)
    expect(
      requiresRecentInteractionWindow(
        broadcastSubactions.enum.instagramActiveContacts,
      ),
    ).toBe(true)
    expect(
      requiresRecentInteractionWindow(
        broadcastSubactions.enum.tiktokActiveContacts,
      ),
    ).toBe(true)
  })

  test("does not require the 24h messaging window for templates, all contacts, Telegram, or unset subactions", () => {
    expect(
      requiresRecentInteractionWindow(broadcastSubactions.enum.allContacts),
    ).toBe(false)
    expect(
      requiresRecentInteractionWindow(
        broadcastSubactions.enum.messengerTemplateMessage,
      ),
    ).toBe(false)
    expect(
      requiresRecentInteractionWindow(
        broadcastSubactions.enum.whatsappTemplateMessage,
      ),
    ).toBe(false)
    expect(
      requiresRecentInteractionWindow(
        broadcastSubactions.enum.telegramAllContacts,
      ),
    ).toBe(false)
    expect(requiresRecentInteractionWindow(null)).toBe(false)
    expect(requiresRecentInteractionWindow(undefined)).toBe(false)
  })

  test("declares an audience rule for every broadcast subaction", () => {
    expect(Object.keys(broadcastSubactionAudienceRules).sort()).toEqual(
      broadcastSubactions.options.toSorted(),
    )
  })
})

describe("broadcastChannelCapabilities", () => {
  test("declares default subactions that belong to each channel capability", () => {
    for (const capability of broadcastChannelCapabilities) {
      expect(capability.subactions).toContain(capability.defaultSubaction)
    }
  })

  test("finds Instagram, Telegram, and TikTok capabilities and excludes non-broadcast channels", () => {
    expect(findBroadcastChannelCapability("instagram")).toMatchObject({
      channel: "instagram",
      defaultSubaction: broadcastSubactions.enum.instagramActiveContacts,
    })
    expect(findBroadcastChannelCapability("telegram")).toMatchObject({
      channel: "telegram",
      defaultSubaction: broadcastSubactions.enum.telegramAllContacts,
    })
    expect(findBroadcastChannelCapability("tiktok")).toMatchObject({
      channel: "tiktok",
      defaultSubaction: broadcastSubactions.enum.tiktokActiveContacts,
    })
    expect(findBroadcastChannelCapability("webchat")).toBeUndefined()
  })

  test("marks only Messenger and WhatsApp as supporting template broadcasts", () => {
    const templateChannels = broadcastChannelCapabilities
      .filter((capability) => capability.supportsTemplateBroadcast)
      .map((capability) => capability.channel)
      .toSorted()

    expect(templateChannels).toEqual(["messenger", "whatsapp"])
    expect(
      findBroadcastChannelCapability("instagram")?.supportsTemplateBroadcast,
    ).toBe(false)
    expect(
      findBroadcastChannelCapability("telegram")?.supportsTemplateBroadcast,
    ).toBe(false)
    expect(
      findBroadcastChannelCapability("tiktok")?.supportsTemplateBroadcast,
    ).toBe(false)
  })
})

describe("broadcastStatuses", () => {
  test("includes draft and failed", () => {
    expect(broadcastStatuses.options).toEqual(
      expect.arrayContaining(["draft", "failed"]),
    )
  })
})

describe("resolveBroadcastTerminalStatus", () => {
  test("is sent when no contact failed", () => {
    expect(
      resolveBroadcastTerminalStatus({ contactCount: 10, failedCount: 0 }),
    ).toBe("sent")
  })

  test("is sent when only some contacts failed", () => {
    expect(
      resolveBroadcastTerminalStatus({ contactCount: 10, failedCount: 9 }),
    ).toBe("sent")
  })

  test("is failed when every contact failed", () => {
    expect(
      resolveBroadcastTerminalStatus({ contactCount: 10, failedCount: 10 }),
    ).toBe("failed")
  })

  test("is sent when contactCount is null or zero", () => {
    expect(
      resolveBroadcastTerminalStatus({ contactCount: null, failedCount: 3 }),
    ).toBe("sent")
    expect(
      resolveBroadcastTerminalStatus({ contactCount: 0, failedCount: 0 }),
    ).toBe("sent")
  })
})

describe("isBroadcastOutcomeGraceElapsed", () => {
  const now = new Date("2026-08-31T10:00:00Z")

  test("is false inside the grace window", () => {
    expect(
      isBroadcastOutcomeGraceElapsed({
        handoffCompletedAt: new Date(
          now.getTime() - BROADCAST_OUTCOME_GRACE_MS + 1,
        ),
        now,
      }),
    ).toBe(false)
  })

  test("is true at or past the grace window", () => {
    expect(
      isBroadcastOutcomeGraceElapsed({
        handoffCompletedAt: new Date(
          now.getTime() - BROADCAST_OUTCOME_GRACE_MS,
        ),
        now,
      }),
    ).toBe(true)
  })
})

describe("isTargetsTemplateSendWithoutTemplate", () => {
  test("is true for a legacy top-level templateId with only empty targets (the edge this predicate closes)", () => {
    expect(
      isTargetsTemplateSendWithoutTemplate({
        templateId: "legacy-template",
        targets: [{ inboxId: "inbox-a" }, { inboxId: "inbox-b" }],
      }),
    ).toBe(true)
  })

  test("is true when no target carries a template and there is no legacy templateId either", () => {
    expect(
      isTargetsTemplateSendWithoutTemplate({
        targets: [{ inboxId: "inbox-a" }, { inboxId: "inbox-b" }],
      }),
    ).toBe(true)
  })

  test("is false when at least one target carries a template", () => {
    expect(
      isTargetsTemplateSendWithoutTemplate({
        targets: [
          { inboxId: "inbox-a" },
          { inboxId: "inbox-b", templateId: "template-b" },
        ],
      }),
    ).toBe(false)
  })

  test("is false for a flow send even when no target has a template", () => {
    expect(
      isTargetsTemplateSendWithoutTemplate({
        targets: [
          { inboxId: "inbox-a", flowId: "flow-a" },
          { inboxId: "inbox-b" },
        ],
      }),
    ).toBe(false)
  })

  test("is false for a legacy channel-mode payload without any targets", () => {
    expect(
      isTargetsTemplateSendWithoutTemplate({
        templateId: "legacy-template",
        targets: [],
      }),
    ).toBe(false)
    expect(isTargetsTemplateSendWithoutTemplate({})).toBe(false)
  })

  test("is false once a persisted row pins targetMode to channel, even with empty target rows", () => {
    expect(
      isTargetsTemplateSendWithoutTemplate({
        targetMode: "channel",
        targets: [{ inboxId: "inbox-a" }],
      }),
    ).toBe(false)
  })
})

describe("isTargetsFlowSendWithoutFlow", () => {
  test("is true for a legacy top-level flowId with only empty targets (the edge this predicate closes)", () => {
    expect(
      isTargetsFlowSendWithoutFlow({
        flowId: "legacy-flow",
        targets: [{ inboxId: "inbox-a" }, { inboxId: "inbox-b" }],
      }),
    ).toBe(true)
  })

  test("is true when no target carries a flow and there is no legacy flowId either", () => {
    expect(
      isTargetsFlowSendWithoutFlow({
        targets: [{ inboxId: "inbox-a" }, { inboxId: "inbox-b" }],
      }),
    ).toBe(true)
  })

  test("is false when at least one target carries a flow", () => {
    expect(
      isTargetsFlowSendWithoutFlow({
        targets: [
          { inboxId: "inbox-a" },
          { inboxId: "inbox-b", flowId: "flow-b" },
        ],
      }),
    ).toBe(false)
  })

  test("is false for a template send even when no target has a flow", () => {
    expect(
      isTargetsFlowSendWithoutFlow({
        targets: [
          { inboxId: "inbox-a", templateId: "template-a" },
          { inboxId: "inbox-b" },
        ],
      }),
    ).toBe(false)
  })

  test("is false for a legacy channel-mode payload without any targets", () => {
    expect(
      isTargetsFlowSendWithoutFlow({
        flowId: "legacy-flow",
        targets: [],
      }),
    ).toBe(false)
    expect(isTargetsFlowSendWithoutFlow({})).toBe(false)
  })

  test("is false once a persisted row pins targetMode to channel, even with empty target rows", () => {
    expect(
      isTargetsFlowSendWithoutFlow({
        targetMode: "channel",
        targets: [{ inboxId: "inbox-a" }],
      }),
    ).toBe(false)
  })
})
