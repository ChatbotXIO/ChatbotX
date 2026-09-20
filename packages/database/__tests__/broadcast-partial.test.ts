import { describe, expect, test } from "vitest"
import {
  BROADCAST_AUDIENCE_POSITION_MIN,
  BROADCAST_DEFAULT_SEND_RATE_PER_MINUTE,
  BROADCAST_DISPATCH_WINDOW_MS,
  BROADCAST_MAX_SEND_RATE_PER_MINUTE,
  BROADCAST_OUTCOME_GRACE_MS,
  broadcastChannelCapabilities,
  broadcastSendLimitIssues,
  broadcastSendLimitSchema,
  broadcastStatuses,
  broadcastSubactionAudienceRules,
  broadcastSubactions,
  clampAudienceCountToRange,
  findBroadcastChannelCapability,
  isAudienceRangeOrdered,
  isBroadcastOutcomeGraceElapsed,
  isTargetsFlowSendWithoutFlow,
  isTargetsTemplateSendWithoutTemplate,
  normalizeBroadcastSendLimit,
  requiresRecentInteractionWindow,
  resolveAudiencePageWindow,
  resolveBroadcastAudienceRange,
  resolveBroadcastSendRatePerMinute,
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

describe("isAudienceRangeOrdered", () => {
  test("is true when both bounds are null, only one bound is set, or start <= end", () => {
    expect(
      isAudienceRangeOrdered({
        audienceRangeStart: null,
        audienceRangeEnd: null,
      }),
    ).toBe(true)
    expect(
      isAudienceRangeOrdered({ audienceRangeStart: 5, audienceRangeEnd: null }),
    ).toBe(true)
    expect(
      isAudienceRangeOrdered({ audienceRangeStart: null, audienceRangeEnd: 5 }),
    ).toBe(true)
    expect(
      isAudienceRangeOrdered({ audienceRangeStart: 3, audienceRangeEnd: 3 }),
    ).toBe(true)
    expect(
      isAudienceRangeOrdered({ audienceRangeStart: 3, audienceRangeEnd: 10 }),
    ).toBe(true)
  })

  test("is false when start is after end", () => {
    expect(
      isAudienceRangeOrdered({ audienceRangeStart: 10, audienceRangeEnd: 3 }),
    ).toBe(false)
  })
})

describe("resolveBroadcastAudienceRange", () => {
  test("is null when neither bound is set — callers keep today's query byte-identical", () => {
    expect(
      resolveBroadcastAudienceRange({
        audienceRangeStart: null,
        audienceRangeEnd: null,
      }),
    ).toBeNull()
  })

  test("is offset 0 with no size cap when start is 1 and end is unset", () => {
    expect(
      resolveBroadcastAudienceRange({
        audienceRangeStart: 1,
        audienceRangeEnd: null,
      }),
    ).toEqual({ offset: 0, size: null })
  })

  test("is offset start-1 with no size cap when only start is set", () => {
    expect(
      resolveBroadcastAudienceRange({
        audienceRangeStart: 8,
        audienceRangeEnd: null,
      }),
    ).toEqual({ offset: 7, size: null })
  })

  test("is offset 0 with size end when only end is set", () => {
    expect(
      resolveBroadcastAudienceRange({
        audienceRangeStart: null,
        audienceRangeEnd: 20,
      }),
    ).toEqual({ offset: 0, size: 20 })
  })

  test("is offset start-1 with size end-start+1 when both bounds are set", () => {
    expect(
      resolveBroadcastAudienceRange({
        audienceRangeStart: 5,
        audienceRangeEnd: 14,
      }),
    ).toEqual({ offset: 4, size: 10 })
  })

  test("clamps size to 0 (never throws) when the range is unordered", () => {
    expect(
      resolveBroadcastAudienceRange({
        audienceRangeStart: 10,
        audienceRangeEnd: 3,
      }),
    ).toEqual({ offset: 9, size: 0 })
  })
})

describe("clampAudienceCountToRange", () => {
  test("returns the total unchanged when the range is null", () => {
    expect(clampAudienceCountToRange(42, null)).toBe(42)
  })

  test("returns the window size when it lies fully inside the total", () => {
    expect(clampAudienceCountToRange(100, { offset: 10, size: 20 })).toBe(20)
  })

  test("clamps to the remaining rows when the window extends past the total", () => {
    expect(clampAudienceCountToRange(15, { offset: 10, size: 20 })).toBe(5)
  })

  test("is 0 when the start position lies past the total", () => {
    expect(clampAudienceCountToRange(5, { offset: 10, size: 20 })).toBe(0)
  })

  test("is 0 for an unordered range (size 0)", () => {
    expect(clampAudienceCountToRange(100, { offset: 9, size: 0 })).toBe(0)
  })

  test("returns every row from the offset onward when size is null (open-ended range)", () => {
    expect(clampAudienceCountToRange(100, { offset: 10, size: null })).toBe(90)
  })
})

describe("resolveAudiencePageWindow", () => {
  test("is the plain page window when there is no range", () => {
    expect(
      resolveAudiencePageWindow({ page: 1, perPage: 10, range: null }),
    ).toEqual({ offset: 0, limit: 10 })
    expect(
      resolveAudiencePageWindow({ page: 3, perPage: 10, range: null }),
    ).toEqual({ offset: 20, limit: 10 })
  })

  test("is the page window inside the range, offset by the range start", () => {
    expect(
      resolveAudiencePageWindow({
        page: 1,
        perPage: 10,
        range: { offset: 100, size: 50 },
      }),
    ).toEqual({ offset: 100, limit: 10 })
    expect(
      resolveAudiencePageWindow({
        page: 2,
        perPage: 10,
        range: { offset: 100, size: 50 },
      }),
    ).toEqual({ offset: 110, limit: 10 })
  })

  test("clamps the limit on the last partial page of the range", () => {
    expect(
      resolveAudiencePageWindow({
        page: 5,
        perPage: 10,
        range: { offset: 100, size: 45 },
      }),
    ).toEqual({ offset: 140, limit: 5 })
  })

  test("is null once the page lies entirely past the range", () => {
    expect(
      resolveAudiencePageWindow({
        page: 6,
        perPage: 10,
        range: { offset: 100, size: 45 },
      }),
    ).toBeNull()
  })
})

describe("normalizeBroadcastSendLimit", () => {
  test("normalizes undefined to null for every field", () => {
    expect(normalizeBroadcastSendLimit({})).toEqual({
      audienceRangeStart: null,
      audienceRangeEnd: null,
      sendRatePerMinute: null,
    })
  })

  test("passes explicit null values through unchanged", () => {
    expect(
      normalizeBroadcastSendLimit({
        audienceRangeStart: null,
        audienceRangeEnd: null,
        sendRatePerMinute: null,
      }),
    ).toEqual({
      audienceRangeStart: null,
      audienceRangeEnd: null,
      sendRatePerMinute: null,
    })
  })

  test("keeps set numeric values", () => {
    expect(
      normalizeBroadcastSendLimit({
        audienceRangeStart: 5,
        audienceRangeEnd: 50,
        sendRatePerMinute: 200,
      }),
    ).toEqual({
      audienceRangeStart: 5,
      audienceRangeEnd: 50,
      sendRatePerMinute: 200,
    })
  })
})

describe("resolveBroadcastSendRatePerMinute", () => {
  test("falls back to the default rate when unset", () => {
    expect(resolveBroadcastSendRatePerMinute({ sendRatePerMinute: null })).toBe(
      BROADCAST_DEFAULT_SEND_RATE_PER_MINUTE,
    )
  })

  test("returns the stored rate when set", () => {
    expect(resolveBroadcastSendRatePerMinute({ sendRatePerMinute: 750 })).toBe(
      750,
    )
  })
})

describe("broadcastSendLimitSchema", () => {
  test("accepts null, undefined, and the max rate", () => {
    expect(
      broadcastSendLimitSchema.safeParse({
        audienceRangeStart: null,
        audienceRangeEnd: null,
        sendRatePerMinute: null,
      }).success,
    ).toBe(true)
    expect(broadcastSendLimitSchema.safeParse({}).success).toBe(true)
    expect(
      broadcastSendLimitSchema.safeParse({
        sendRatePerMinute: BROADCAST_MAX_SEND_RATE_PER_MINUTE,
      }).success,
    ).toBe(true)
  })

  test("rejects a position below BROADCAST_AUDIENCE_POSITION_MIN", () => {
    expect(
      broadcastSendLimitSchema.safeParse({
        audienceRangeStart: BROADCAST_AUDIENCE_POSITION_MIN - 1,
      }).success,
    ).toBe(false)
    expect(
      broadcastSendLimitSchema.safeParse({ audienceRangeEnd: 0 }).success,
    ).toBe(false)
  })

  test("rejects non-integer values", () => {
    expect(
      broadcastSendLimitSchema.safeParse({ audienceRangeStart: 1.5 }).success,
    ).toBe(false)
    expect(
      broadcastSendLimitSchema.safeParse({ sendRatePerMinute: 500.5 }).success,
    ).toBe(false)
  })

  test("rejects a rate above BROADCAST_MAX_SEND_RATE_PER_MINUTE", () => {
    expect(
      broadcastSendLimitSchema.safeParse({
        sendRatePerMinute: BROADCAST_MAX_SEND_RATE_PER_MINUTE + 1,
      }).success,
    ).toBe(false)
  })

  test("accepts BROADCAST_MAX_SEND_RATE_PER_MINUTE at 1000", () => {
    expect(BROADCAST_MAX_SEND_RATE_PER_MINUTE).toBe(1000)
    expect(BROADCAST_DEFAULT_SEND_RATE_PER_MINUTE).toBe(500)
    expect(BROADCAST_DISPATCH_WINDOW_MS).toBe(55_000)
  })
})

describe("broadcastSendLimitIssues", () => {
  test("carries a stable message key for an unordered audience range", () => {
    expect(broadcastSendLimitIssues.rangeEndBeforeStart).toBe(
      "broadcastSendLimit.rangeEndBeforeStart",
    )
  })
})
