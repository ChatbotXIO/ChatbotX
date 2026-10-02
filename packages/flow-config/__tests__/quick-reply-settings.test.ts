import { afterEach, describe, expect, test, vi } from "vitest"
import {
  buttonTypes,
  computeQuickReplyFollowUpTriggerAt,
  flowValidationCodes,
  getUserDataStepDefaultFn,
  listQuickReplySettingsHandles,
  quickReplyNextStepFollowsEdge,
  quickReplySettingsDefaultFn,
  resolveActiveQuickReplySettings,
  sendMessageNodeDefaultFn,
  sendMessageNodeSchema,
  sendTextStepDefaultFn,
  startAnotherNodeStepDefaultFn,
  startExternalFlowStepDefaultFn,
} from "../src"

const nodeTarget = () => ({
  buttonType: buttonTypes.enum.startAnotherNode,
  beforeStep: startAnotherNodeStepDefaultFn({ nodeId: "2", viewOnly: true }),
})

const quickReply = {
  id: "10",
  label: "Yes",
  buttonType: null,
  beforeStep: null,
  steps: [],
}

function makeNode(overrides: {
  quickReplies?: unknown[]
  steps?: unknown[]
  quickReplySettings?: unknown
}) {
  const node = sendMessageNodeDefaultFn({
    nodeProps: { id: "1", position: { x: 0, y: 0 } },
  })
  return {
    ...node,
    data: {
      ...node.data,
      details: {
        ...node.data.details,
        steps: overrides.steps ?? [
          sendTextStepDefaultFn({ id: "3", text: "Hi" }),
        ],
        quickReplies: overrides.quickReplies ?? [quickReply],
        ...(overrides.quickReplySettings === undefined
          ? {}
          : { quickReplySettings: overrides.quickReplySettings }),
      },
    },
  }
}

function issuePaths(node: unknown) {
  const result = sendMessageNodeSchema.safeParse(node)
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.path.join("."))
}

function issueMessages(node: unknown) {
  const result = sendMessageNodeSchema.safeParse(node)
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

describe("quickReplySettingsDefaultFn", () => {
  test("creates both sections disabled with stable ids", () => {
    const settings = quickReplySettingsDefaultFn()
    expect(settings.followUp).toMatchObject({
      enabled: false,
      duration: 1,
      unit: "days",
      target: null,
    })
    expect(settings.retry).toMatchObject({
      enabled: false,
      message: "",
      maxRetries: 3,
      target: null,
    })
    expect(settings.followUp.id).not.toBe(settings.retry.id)
  })

  test("new send message nodes carry default settings", () => {
    const node = sendMessageNodeDefaultFn({
      nodeProps: { id: "1", position: { x: 0, y: 0 } },
    })
    expect(node.data.details.quickReplySettings?.retry.maxRetries).toBe(3)
  })
})

describe("sendMessageNodeSchema quickReplySettings", () => {
  test("accepts a node saved before the feature (no quickReplySettings)", () => {
    const node = makeNode({})
    const { quickReplySettings: _omit, ...details } = node.data.details
    expect(
      sendMessageNodeSchema.safeParse({
        ...node,
        data: { ...node.data, details },
      }).success,
    ).toBe(true)
  })

  test("requires a target for an enabled follow-up", () => {
    const settings = quickReplySettingsDefaultFn()
    settings.followUp.enabled = true
    expect(issueMessages(makeNode({ quickReplySettings: settings }))).toContain(
      flowValidationCodes.quickReplyNextStepRequired,
    )
  })

  test("requires a target for an enabled retry", () => {
    const settings = quickReplySettingsDefaultFn()
    settings.retry.enabled = true
    settings.retry.message = "Tap one"
    expect(issueMessages(makeNode({ quickReplySettings: settings }))).toContain(
      flowValidationCodes.quickReplyNextStepRequired,
    )
  })

  test("requires a retry message when retries >= 1", () => {
    const settings = quickReplySettingsDefaultFn()
    settings.retry = { ...settings.retry, enabled: true, target: nodeTarget() }
    expect(issueMessages(makeNode({ quickReplySettings: settings }))).toContain(
      flowValidationCodes.quickReplyRetryMessageRequired,
    )
  })

  test("allows an empty retry message when retries = 0", () => {
    const settings = quickReplySettingsDefaultFn()
    settings.retry = {
      ...settings.retry,
      enabled: true,
      maxRetries: 0,
      target: nodeTarget(),
    }
    expect(issueMessages(makeNode({ quickReplySettings: settings }))).toEqual(
      [],
    )
  })

  test("rejects retries above 5", () => {
    const settings = quickReplySettingsDefaultFn()
    settings.retry = {
      ...settings.retry,
      enabled: true,
      maxRetries: 6,
      message: "Tap",
      target: nodeTarget(),
    }
    expect(issuePaths(makeNode({ quickReplySettings: settings }))).toContain(
      "data.details.quickReplySettings.retry.maxRetries",
    )
  })

  test("rejects a follow-up longer than 366 days", () => {
    const settings = quickReplySettingsDefaultFn()
    settings.followUp = {
      ...settings.followUp,
      enabled: true,
      duration: 367,
      unit: "days",
      target: nodeTarget(),
    }
    expect(issuePaths(makeNode({ quickReplySettings: settings }))).toContain(
      "data.details.quickReplySettings.followUp.duration",
    )
  })

  test("rejects retry together with a getUserData step", () => {
    const settings = quickReplySettingsDefaultFn()
    settings.retry = {
      ...settings.retry,
      enabled: true,
      message: "Tap",
      target: nodeTarget(),
    }
    expect(
      issueMessages(
        makeNode({
          quickReplySettings: settings,
          steps: [getUserDataStepDefaultFn()],
        }),
      ),
    ).toContain(flowValidationCodes.quickReplyRetryWithGetUserData)
  })

  test("ignores settings when the node has no quick replies", () => {
    const settings = quickReplySettingsDefaultFn()
    settings.followUp.enabled = true
    settings.retry.enabled = true
    expect(
      issueMessages(
        makeNode({ quickReplySettings: settings, quickReplies: [] }),
      ),
    ).toEqual([])
  })
})

describe("resolveActiveQuickReplySettings", () => {
  test("returns nothing for legacy details", () => {
    expect(resolveActiveQuickReplySettings(undefined)).toEqual({})
    expect(
      resolveActiveQuickReplySettings({
        steps: [],
        quickReplies: [quickReply],
      }),
    ).toEqual({})
  })

  test("returns only enabled sections that have a target", () => {
    const settings = quickReplySettingsDefaultFn()
    settings.followUp = {
      ...settings.followUp,
      enabled: true,
      target: nodeTarget(),
    }
    settings.retry = { ...settings.retry, enabled: true, message: "Tap" }
    const active = resolveActiveQuickReplySettings({
      steps: [],
      quickReplies: [quickReply],
      quickReplySettings: settings,
    })
    expect(active.followUp?.id).toBe(settings.followUp.id)
    expect(active.retry).toBeUndefined()
  })

  test("drops retry when the node contains getUserData", () => {
    const settings = quickReplySettingsDefaultFn()
    settings.retry = {
      ...settings.retry,
      enabled: true,
      message: "Tap",
      target: nodeTarget(),
    }
    expect(
      resolveActiveQuickReplySettings({
        steps: [getUserDataStepDefaultFn()],
        quickReplies: [quickReply],
        quickReplySettings: settings,
      }).retry,
    ).toBeUndefined()
  })

  test("coerces a string maxRetries to a number", () => {
    const settings = quickReplySettingsDefaultFn()
    settings.retry = {
      ...settings.retry,
      enabled: true,
      message: "Tap",
      maxRetries: "2" as unknown as number,
      target: nodeTarget(),
    }
    expect(
      resolveActiveQuickReplySettings({
        steps: [],
        quickReplies: [quickReply],
        quickReplySettings: settings,
      }).retry?.maxRetries,
    ).toBe(2)
  })
})

describe("listQuickReplySettingsHandles", () => {
  test("lists a handle for an enabled section with no target yet", () => {
    const settings = quickReplySettingsDefaultFn()
    settings.followUp.enabled = true
    expect(
      listQuickReplySettingsHandles({
        steps: [],
        quickReplies: [quickReply],
        quickReplySettings: settings,
      }),
    ).toEqual([{ kind: "followUp", id: settings.followUp.id }])
  })

  test("omits a handle for an external target and when there are no quick replies", () => {
    const settings = quickReplySettingsDefaultFn()
    settings.followUp = {
      ...settings.followUp,
      enabled: true,
      target: {
        buttonType: buttonTypes.enum.startExternalFlow,
        beforeStep: startExternalFlowStepDefaultFn(),
      },
    }
    settings.retry.enabled = true
    expect(
      listQuickReplySettingsHandles({
        steps: [],
        quickReplies: [quickReply],
        quickReplySettings: settings,
      }),
    ).toEqual([{ kind: "retry", id: settings.retry.id }])
    expect(
      listQuickReplySettingsHandles({
        steps: [],
        quickReplies: [],
        quickReplySettings: settings,
      }),
    ).toEqual([])
  })
})

describe("listQuickReplySettingsHandles — partial settings", () => {
  test("a settings object missing a section does not throw", () => {
    const settings = quickReplySettingsDefaultFn()
    settings.retry.enabled = true
    expect(
      listQuickReplySettingsHandles({
        steps: [],
        quickReplies: [quickReply],
        quickReplySettings: { retry: settings.retry },
      }),
    ).toEqual([{ kind: "retry", id: settings.retry.id }])
    expect(
      listQuickReplySettingsHandles({
        steps: [],
        quickReplies: [quickReply],
        quickReplySettings: {},
      }),
    ).toEqual([])
  })
})

describe("quickReplyNextStepFollowsEdge", () => {
  test("true for node jumps and empty targets, false for external", () => {
    expect(quickReplyNextStepFollowsEdge(null)).toBe(true)
    expect(quickReplyNextStepFollowsEdge(nodeTarget())).toBe(true)
    expect(
      quickReplyNextStepFollowsEdge({
        buttonType: buttonTypes.enum.startExternalFlow,
        beforeStep: startExternalFlowStepDefaultFn(),
      }),
    ).toBe(false)
  })
})

describe("computeQuickReplyFollowUpTriggerAt", () => {
  afterEach(() => vi.useRealTimers())

  test("adds the configured delay to now", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-30T00:00:00.000Z"))
    expect(
      computeQuickReplyFollowUpTriggerAt({
        duration: 2,
        unit: "hours",
      }).toISOString(),
    ).toBe("2026-09-30T02:00:00.000Z")
  })
})
