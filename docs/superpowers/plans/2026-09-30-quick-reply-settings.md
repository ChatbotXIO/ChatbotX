# Quick Reply Settings (Follow-up & Retry) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a flow author configure, once per Send Message node, a follow-up when the contact hasn't engaged and a retry loop when the contact replies with something other than a quick reply — each routing to a chosen next step.

**Architecture:** Settings live on `sendMessage.details.quickReplySettings` (flow-config). At runtime, Retry reuses the conversation `challenge` slot (new `type: "quickReply"`) and the existing challenge routing; Follow-up reuses `ContactOnSmartDelay` (new type `quickReplyFollowUp`) and the lazy "has the contact replied since?" check the Follow Up step already uses. Next-step targets are label-less buttons routed through the same `runStepsAndQuickReplies({ targetType: "quickReply" })` path a tapped quick reply uses; each settings section has a stable `id` that is the canvas edge `sourceHandle`.

**Tech Stack:** TypeScript, zod 4, Drizzle/PostgreSQL, BullMQ, Next.js 16 / React 19, react-hook-form, @xyflow/react, next-intl, vitest.

**Spec:** `docs/superpowers/specs/2026-09-30-quick-reply-settings-design.md`

The spec's §9 lists the decisions revised during planning (handle id on the section, lazy follow-up engagement check, different-flow cancellation, `resumeQuickReplyFollowUp` job, two migrations, webchat tap guard). Read §3–§5 of the spec before starting any task.

## Global Constraints

- Retries: integer `0`–`5`, default `3`. `0` = first non-QR reply routes straight to the retry target, no retry message.
- Wait units: `minutes | hours | days`; duration integer ≥ 1; total ≤ `FOLLOW_UP_MAX_DELAY_DAYS` (366 days).
- Retry message: trimmed, max 255 chars, variables allowed; default copy `"Please, tap one of the options below 👇"` (i18n key `flows.quickReplySettings.retry.messageDefault`).
- Next-step picker hides `openWebsite` and `whatsappOptionList`.
- An enabled section without a target is a validation error; Retry cannot be enabled when the node's `steps` contain a `getUserData` step; settings are ignored (not validated, not armed, no handles) when `quickReplies` is empty.
- Settings dialog saves live (no footer), bound to the node form.
- ⚙️ icon visible only when `quickReplies.length >= 1`.
- All user-facing strings via `useTranslations()`; add keys to **every** file in `apps/builder/messages/*.json` (21 locales; never edit `en.d.json.ts`).
- No direct `db` in `apps/` except the pre-existing legacy write in `handoff-executor.service.ts` (extend it in place, don't add new ones).
- No dynamic `import()` in `packages/*` or `apps/worker`.
- Server logging: `logger.x({ err: error }, "...")` — key is `err`.
- Never run `db:migrate`; generate migrations and show the SQL.
- Stage specific files only (never `git add -A` / `git add .`).
- Commit only if the user has approved commits for this execution; otherwise stop at "stage".

## Review Focus

1. **Messenger/Instagram tap with label text while a retry is pending** → must run the tapped quick reply, never a retry. (Task 5 test: `runFlowQuickReply` clears the quickReply challenge.)
2. **Webchat quick-reply tap while a retry is pending** → must not enqueue `runChallenge`. (Task 7 test on `shouldRunWebchatChallenge`.)
3. **Node with quick replies *and* a Continue edge to the next node in the same flow** → armed state must survive the next node's entry. (Task 5 test: same-flow entry does not clear the challenge.)
4. **Flows saved before this feature (no `quickReplySettings`)** → editor opens, publishes, and the worker neither arms nor crashes. (Task 1 tests on schema + `resolveActiveQuickReplySettings(undefined)`; Task 5 test arm no-op.)
5. **Two free-text messages arriving together while a retry is pending** → exactly one retry message is sent. (Task 6 test: CAS loser does nothing.)

---

## File map

**packages/flow-config**
- Create `src/steps/quick-reply-settings.ts` — schemas, defaults, `refineQuickReplySettings`, `resolveActiveQuickReplySettings`, `listQuickReplySettingsHandles`, `quickReplyNextStepFollowsEdge`, `computeQuickReplyFollowUpTriggerAt`.
- Modify `src/nodes/send-message.ts` — add field + refinement + default.
- Modify `src/validation-codes.ts` — three codes.
- Modify `src/routable-handle.ts` — `quickReplySettings` accessor.
- Modify `src/index.ts` — export new step file.
- Tests: `__tests__/quick-reply-settings.test.ts`, `__tests__/routable-handle.test.ts` (extend).

**packages/database**
- Modify `src/partials/contact-on-smart-delay.ts`, `src/partials/conversation.ts`, `src/schema/contact-on-smart-delay.ts`; two generated migrations.

**packages/worker-config**
- Modify `src/queues/integration/index.ts` — widen challenge type, add `resumeQuickReplyFollowUp`.

**packages/business**
- Modify `src/smart-delay/service.ts`, `src/conversation/service.ts`, `src/flow-version/service.ts`.

**apps/worker**
- Create `src/integration/handlers/quick-reply-settings.ts` (arm + clear; no `flow.ts` import).
- Create `src/integration/handlers/quick-reply-resume.ts` (retry + follow-up resume + route; imports `flow.ts`).
- Modify `handlers/flow.ts`, `handlers/challenge.ts`, `handlers/get-user-data.ts`, `handlers/smart-delay.ts`, `integration/worker.ts`, `trigger/services/handoff-executor.service.ts`.
- Tests: `__tests__/quick-reply-settings.test.ts`, `__tests__/quick-reply-resume.test.ts`, extend `__tests__/flow.test.ts`, `__tests__/challenge-handler.test.ts`.

**apps/builder**
- Create `src/features/flows/react-flow/hooks/use-button-target.ts`.
- Create `src/features/flows/react-flow/nodes/quick-reply-settings/quick-reply-settings-dialog.tsx`, `next-step-picker.tsx`, `quick-reply-settings-handles.tsx`.
- Create `src/features/messages/lib/should-run-webchat-challenge.ts`.
- Modify `react-flow/button-editor-dialog.tsx`, `react-flow/nodes/editor.tsx`, `react-flow/nodes/viewer.tsx`, `react-flow/nodes/analytics-viewer.tsx`, `react-flow/toolbar/duplicate-node-data.ts`, `features/messages/actions/create-webchat-message.action.ts`, `messages/*.json`.
- Tests: `__tests__/should-run-webchat-challenge.test.ts`, extend `react-flow/toolbar/__tests__/duplicate-node-data.test.ts`.

---

### Task 1: flow-config — settings schema, helpers, node wiring

**Files:**
- Create: `packages/flow-config/src/steps/quick-reply-settings.ts`
- Modify: `packages/flow-config/src/nodes/send-message.ts:32-80`
- Modify: `packages/flow-config/src/validation-codes.ts:14-26`
- Modify: `packages/flow-config/src/index.ts` (alphabetical `export * from "./steps/..."` block, lines 65-168)
- Test: `packages/flow-config/__tests__/quick-reply-settings.test.ts`

**Interfaces:**
- Produces:
  - `quickReplySettingsDelayUnits` (zod enum `minutes|hours|days`)
  - `QUICK_REPLY_MAX_RETRIES = 5`, `QUICK_REPLY_DEFAULT_RETRIES = 3`, `QUICK_REPLY_RETRY_MESSAGE_MAX = 255`
  - `quickReplyNextStepHiddenButtonTypes: ButtonType[]`
  - `quickReplyNextStepSchema`, `type QuickReplyNextStep = { buttonType: "sendMessage"|"performAction"|"startAnotherNode"; beforeStep: StartAnotherNodeStepSchema } | { buttonType: "startExternalFlow"; beforeStep: StartExternalFlowStepSchema } | { buttonType: "startExternalNode"; beforeStep: StartExternalNodeStepSchema }`
  - `quickReplySettingsSchema`, `type QuickReplySettings = { followUp: QuickReplyFollowUpSettings; retry: QuickReplyRetrySettings }`
  - `type QuickReplyFollowUpSettings = { id: string; enabled: boolean; duration: number; unit: "minutes"|"hours"|"days"; target: QuickReplyNextStep | null }`
  - `type QuickReplyRetrySettings = { id: string; enabled: boolean; message: string; maxRetries: number; target: QuickReplyNextStep | null }`
  - `quickReplySettingsDefaultFn(): QuickReplySettings`
  - `refineQuickReplySettings(details: { steps: { stepType: string }[]; quickReplies: unknown[]; quickReplySettings?: QuickReplySettings }, ctx: z.RefinementCtx): void`
  - `resolveActiveQuickReplySettings(details: unknown): { followUp?: QuickReplyFollowUpSettings & { target: QuickReplyNextStep }; retry?: QuickReplyRetrySettings & { target: QuickReplyNextStep } }`
  - `listQuickReplySettingsHandles(details: unknown): Array<{ kind: "followUp" | "retry"; id: string }>`
  - `quickReplyNextStepFollowsEdge(target: QuickReplyNextStep | null): boolean`
  - `computeQuickReplyFollowUpTriggerAt(settings: Pick<QuickReplyFollowUpSettings, "duration" | "unit">): Date`
  - `flowValidationCodes.quickReplyNextStepRequired | quickReplyRetryMessageRequired | quickReplyRetryWithGetUserData`

- [ ] **Step 1: Write the failing test**

Create `packages/flow-config/__tests__/quick-reply-settings.test.ts`:

```ts
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
        steps: overrides.steps ?? [sendTextStepDefaultFn({ id: "3", text: "Hi" })],
        quickReplies: overrides.quickReplies ?? [quickReply],
        ...(overrides.quickReplySettings === undefined
          ? {}
          : { quickReplySettings: overrides.quickReplySettings }),
      },
    },
  }
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
      sendMessageNodeSchema.safeParse({ ...node, data: { ...node.data, details } })
        .success,
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
    expect(issueMessages(makeNode({ quickReplySettings: settings }))).toEqual([])
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
    expect(issueMessages(makeNode({ quickReplySettings: settings })).length).toBeGreaterThan(0)
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
    expect(issueMessages(makeNode({ quickReplySettings: settings })).length).toBeGreaterThan(0)
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
      issueMessages(makeNode({ quickReplySettings: settings, quickReplies: [] })),
    ).toEqual([])
  })
})

describe("resolveActiveQuickReplySettings", () => {
  test("returns nothing for legacy details", () => {
    expect(resolveActiveQuickReplySettings(undefined)).toEqual({})
    expect(
      resolveActiveQuickReplySettings({ steps: [], quickReplies: [quickReply] }),
    ).toEqual({})
  })

  test("returns only enabled sections that have a target", () => {
    const settings = quickReplySettingsDefaultFn()
    settings.followUp = { ...settings.followUp, enabled: true, target: nodeTarget() }
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
    settings.retry = { ...settings.retry, enabled: true, message: "Tap", target: nodeTarget() }
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
      computeQuickReplyFollowUpTriggerAt({ duration: 2, unit: "hours" }).toISOString(),
    ).toBe("2026-09-30T02:00:00.000Z")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @chatbotx.io/flow-config exec vitest run __tests__/quick-reply-settings.test.ts`
Expected: FAIL — `quickReplySettingsDefaultFn` (and siblings) is not exported.

- [ ] **Step 3: Add validation codes**

In `packages/flow-config/src/validation-codes.ts`, add inside `flowValidationCodes` (after `waTemplateMpmIncompleteProducts`):

```ts
  quickReplyNextStepRequired: "quickReplyNextStepRequired",
  quickReplyRetryMessageRequired: "quickReplyRetryMessageRequired",
  quickReplyRetryWithGetUserData: "quickReplyRetryWithGetUserData",
```

- [ ] **Step 4: Create the settings module**

Create `packages/flow-config/src/steps/quick-reply-settings.ts`:

```ts
import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { addMilliseconds } from "date-fns"
import { z } from "zod"
import { flowValidationCodes } from "../validation-codes"
import { type ButtonType, buttonTypes } from "./button"
import { FOLLOW_UP_MAX_DELAY_DAYS } from "./follow-up"
import { startAnotherNodeStepSchema } from "./start-another-node"
import { startExternalFlowStepSchema } from "./start-external-flow"
import { startExternalNodeStepSchema } from "./start-external-node"
import { stepTypes } from "./step-action"
import { delayUnitToMs, waitStepDelayUnits } from "./wait"

export const quickReplySettingsDelayUnits = waitStepDelayUnits.extract([
  "minutes",
  "hours",
  "days",
])
export type QuickReplySettingsDelayUnit = z.infer<
  typeof quickReplySettingsDelayUnits
>

export const QUICK_REPLY_MAX_RETRIES = 5
export const QUICK_REPLY_DEFAULT_RETRIES = 3
export const QUICK_REPLY_RETRY_MESSAGE_MAX = 255
const FOLLOW_UP_MAX_DELAY_MS = FOLLOW_UP_MAX_DELAY_DAYS * 86_400_000

/** Open Website needs a click and an option list is WhatsApp-only UI. */
export const quickReplyNextStepHiddenButtonTypes: ButtonType[] = [
  buttonTypes.enum.openWebsite,
  buttonTypes.enum.whatsappOptionList,
]

/**
 * A label-less, steps-less button. The handle id lives on the owning section
 * (`followUp.id` / `retry.id`) so an edge can be dropped and re-drawn without
 * the handle disappearing.
 */
export const quickReplyNextStepSchema = z.discriminatedUnion("buttonType", [
  z.object({
    buttonType: z.literal(buttonTypes.enum.sendMessage),
    beforeStep: startAnotherNodeStepSchema,
  }),
  z.object({
    buttonType: z.literal(buttonTypes.enum.performAction),
    beforeStep: startAnotherNodeStepSchema,
  }),
  z.object({
    buttonType: z.literal(buttonTypes.enum.startAnotherNode),
    beforeStep: startAnotherNodeStepSchema,
  }),
  z.object({
    buttonType: z.literal(buttonTypes.enum.startExternalFlow),
    beforeStep: startExternalFlowStepSchema,
  }),
  z.object({
    buttonType: z.literal(buttonTypes.enum.startExternalNode),
    beforeStep: startExternalNodeStepSchema,
  }),
])
export type QuickReplyNextStep = z.infer<typeof quickReplyNextStepSchema>

export const quickReplyFollowUpSettingsSchema = z.object({
  id: zodBigintAsString(),
  enabled: z.boolean(),
  duration: z.coerce.number().int().min(1),
  unit: quickReplySettingsDelayUnits,
  target: quickReplyNextStepSchema.nullable(),
})
export type QuickReplyFollowUpSettings = z.infer<
  typeof quickReplyFollowUpSettingsSchema
>

export const quickReplyRetrySettingsSchema = z.object({
  id: zodBigintAsString(),
  enabled: z.boolean(),
  message: z.string().trim().max(QUICK_REPLY_RETRY_MESSAGE_MAX),
  maxRetries: z.coerce.number().int().min(0).max(QUICK_REPLY_MAX_RETRIES),
  target: quickReplyNextStepSchema.nullable(),
})
export type QuickReplyRetrySettings = z.infer<
  typeof quickReplyRetrySettingsSchema
>

export const quickReplySettingsSchema = z.object({
  followUp: quickReplyFollowUpSettingsSchema,
  retry: quickReplyRetrySettingsSchema,
})
export type QuickReplySettings = z.infer<typeof quickReplySettingsSchema>

export const quickReplySettingsDefaultFn = (): QuickReplySettings => ({
  followUp: {
    id: createId(),
    enabled: false,
    duration: 1,
    unit: quickReplySettingsDelayUnits.enum.days,
    target: null,
  },
  retry: {
    id: createId(),
    enabled: false,
    message: "",
    maxRetries: QUICK_REPLY_DEFAULT_RETRIES,
    target: null,
  },
})

type SettingsBearingDetails = {
  steps?: readonly { stepType?: unknown }[]
  quickReplies?: readonly unknown[]
  quickReplySettings?: QuickReplySettings | null
}

const asSettingsDetails = (details: unknown): SettingsBearingDetails | null =>
  details && typeof details === "object"
    ? (details as SettingsBearingDetails)
    : null

const hasGetUserDataStep = (details: SettingsBearingDetails) =>
  (details.steps ?? []).some(
    (step) => step?.stepType === stepTypes.enum.getUserData,
  )

/** Node-level rules: they need `steps` and `quickReplies` as well. */
export const refineQuickReplySettings = (
  details: SettingsBearingDetails,
  ctx: z.RefinementCtx,
): void => {
  const settings = details.quickReplySettings
  if (!settings || (details.quickReplies ?? []).length === 0) {
    return
  }

  const { followUp, retry } = settings
  if (followUp.enabled) {
    if (!followUp.target) {
      ctx.addIssue({
        code: "custom",
        path: ["quickReplySettings", "followUp", "target"],
        message: flowValidationCodes.quickReplyNextStepRequired,
      })
    }
    if (
      Number(followUp.duration) * delayUnitToMs(followUp.unit) >
      FOLLOW_UP_MAX_DELAY_MS
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["quickReplySettings", "followUp", "duration"],
        message: `Follow-up delay cannot exceed ${FOLLOW_UP_MAX_DELAY_DAYS} days`,
      })
    }
  }

  if (retry.enabled) {
    if (!retry.target) {
      ctx.addIssue({
        code: "custom",
        path: ["quickReplySettings", "retry", "target"],
        message: flowValidationCodes.quickReplyNextStepRequired,
      })
    }
    if (Number(retry.maxRetries) >= 1 && retry.message.trim().length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["quickReplySettings", "retry", "message"],
        message: flowValidationCodes.quickReplyRetryMessageRequired,
      })
    }
    if (hasGetUserDataStep(details)) {
      ctx.addIssue({
        code: "custom",
        path: ["quickReplySettings", "retry", "enabled"],
        message: flowValidationCodes.quickReplyRetryWithGetUserData,
      })
    }
  }
}

export type ActiveQuickReplySettings = {
  followUp?: QuickReplyFollowUpSettings & { target: QuickReplyNextStep }
  retry?: QuickReplyRetrySettings & { target: QuickReplyNextStep }
}

/**
 * The sections the worker should act on. Node JSON reaches the worker
 * unparsed, so this tolerates legacy nodes and string-typed numbers.
 */
export const resolveActiveQuickReplySettings = (
  rawDetails: unknown,
): ActiveQuickReplySettings => {
  const details = asSettingsDetails(rawDetails)
  const settings = details?.quickReplySettings
  if (!(details && settings) || (details.quickReplies ?? []).length === 0) {
    return {}
  }

  const active: ActiveQuickReplySettings = {}
  if (settings.followUp?.enabled && settings.followUp.target) {
    active.followUp = {
      ...settings.followUp,
      duration: Number(settings.followUp.duration),
      target: settings.followUp.target,
    }
  }
  if (
    settings.retry?.enabled &&
    settings.retry.target &&
    !hasGetUserDataStep(details)
  ) {
    active.retry = {
      ...settings.retry,
      maxRetries: Number(settings.retry.maxRetries),
      target: settings.retry.target,
    }
  }
  return active
}

export const quickReplyNextStepFollowsEdge = (
  target: QuickReplyNextStep | null,
): boolean =>
  target === null ||
  target.buttonType === buttonTypes.enum.sendMessage ||
  target.buttonType === buttonTypes.enum.performAction ||
  target.buttonType === buttonTypes.enum.startAnotherNode

/** Source handles the canvas renders under the quick replies. */
export const listQuickReplySettingsHandles = (
  rawDetails: unknown,
): Array<{ kind: "followUp" | "retry"; id: string }> => {
  const details = asSettingsDetails(rawDetails)
  const settings = details?.quickReplySettings
  if (!(details && settings) || (details.quickReplies ?? []).length === 0) {
    return []
  }

  const handles: Array<{ kind: "followUp" | "retry"; id: string }> = []
  if (
    settings.followUp.enabled &&
    quickReplyNextStepFollowsEdge(settings.followUp.target)
  ) {
    handles.push({ kind: "followUp", id: settings.followUp.id })
  }
  if (
    settings.retry.enabled &&
    !hasGetUserDataStep(details) &&
    quickReplyNextStepFollowsEdge(settings.retry.target)
  ) {
    handles.push({ kind: "retry", id: settings.retry.id })
  }
  return handles
}

export const computeQuickReplyFollowUpTriggerAt = (
  settings: Pick<QuickReplyFollowUpSettings, "duration" | "unit">,
): Date =>
  addMilliseconds(
    Date.now(),
    Number(settings.duration) * delayUnitToMs(settings.unit),
  )
```

- [ ] **Step 5: Wire into the send message node**

In `packages/flow-config/src/nodes/send-message.ts`:

Add import:
```ts
import {
  quickReplySettingsDefaultFn,
  quickReplySettingsSchema,
  refineQuickReplySettings,
} from "../steps/quick-reply-settings"
```

Replace the `details: z.object({ ... quickReplies: ... }),` block's closing so it reads:
```ts
    details: z
      .object({
        beforeStep: chooseChannelStepSchema,
        steps: z.array(
          // ...unchanged discriminated union...
        ),
        quickReplies: z.array(buttonStepSchema).max(MAX_QUICK_REPLIES),
        quickReplySettings: quickReplySettingsSchema.optional(),
      })
      .superRefine(refineQuickReplySettings),
```

In `sendMessageNodeDefaultFn`, add to `details` (before `...props.detailProps`):
```ts
      quickReplySettings: quickReplySettingsDefaultFn(),
```

Then check nothing `.extend()`s or `.omit()`s the details object (zod 4 throws when extending a refined object):

Run: `grep -rn "sendMessageNodeSchema" packages apps --include=*.ts --include=*.tsx | grep -v __tests__`
Expected: only `.parse/.safeParse/.shape` reads and union membership. If any hit calls `.extend`/`.omit`/`.pick` on `…shape.data.shape.details`, stop and report.

- [ ] **Step 6: Export**

In `packages/flow-config/src/index.ts`, add in alphabetical position among the `./steps/*` exports:
```ts
export * from "./steps/quick-reply-settings"
```

- [ ] **Step 7: Run tests**

Run: `pnpm --filter @chatbotx.io/flow-config exec vitest run __tests__/quick-reply-settings.test.ts`
Expected: PASS.

Run: `pnpm --filter @chatbotx.io/flow-config test && pnpm --filter @chatbotx.io/flow-config check-types`
Expected: PASS (existing tests unaffected).

- [ ] **Step 8: Commit**

```bash
git add packages/flow-config/src/steps/quick-reply-settings.ts packages/flow-config/src/nodes/send-message.ts packages/flow-config/src/validation-codes.ts packages/flow-config/src/index.ts packages/flow-config/__tests__/quick-reply-settings.test.ts
git commit -m "feat(flow-config): add quick reply settings schema"
```

---

### Task 2: flow-config — route canvas edges into settings targets

**Files:**
- Modify: `packages/flow-config/src/routable-handle.ts:6-11` (kinds), `:324-329` (accessor list), add accessor
- Test: `packages/flow-config/__tests__/routable-handle.test.ts` (append a `describe`)

**Interfaces:**
- Consumes: `QuickReplySettings`, `quickReplySettingsDefaultFn` (Task 1)
- Produces: `applyRouteInNode(node, handleId, route)` / `applyRouteUpdatesInNodes` now rewrite `details.quickReplySettings.{followUp|retry}.target` when `handleId` equals that section's `id`. `route` → `{ buttonType: "startAnotherNode", beforeStep: startAnotherNode(nodeId, viewOnly) }`; `null` → `target: null` (id kept).

- [ ] **Step 1: Write the failing test**

Append to `packages/flow-config/__tests__/routable-handle.test.ts` (add missing names to its existing `../src` import: `applyRouteInNode`, `buttonTypes`, `quickReplySettingsDefaultFn`, `sendMessageNodeDefaultFn`):

```ts
describe("quick reply settings handles", () => {
  function makeNode() {
    const node = sendMessageNodeDefaultFn({
      nodeProps: { id: "node-1", position: { x: 0, y: 0 } },
    })
    const settings = quickReplySettingsDefaultFn()
    settings.followUp.enabled = true
    node.data.details.quickReplySettings = settings
    return { node, settings }
  }

  test("connecting an edge sets a startAnotherNode target", () => {
    const { node, settings } = makeNode()
    const updated = applyRouteInNode(node, settings.followUp.id, {
      targetNodeId: "node-9",
    })
    const details = updated?.data.details as typeof node.data.details
    expect(details.quickReplySettings?.followUp.target).toMatchObject({
      buttonType: buttonTypes.enum.startAnotherNode,
      beforeStep: { nodeId: "node-9", viewOnly: true },
    })
    expect(details.quickReplySettings?.followUp.id).toBe(settings.followUp.id)
    expect(details.quickReplySettings?.retry).toEqual(settings.retry)
  })

  test("deleting the edge clears the target but keeps the handle id", () => {
    const { node, settings } = makeNode()
    const connected = applyRouteInNode(node, settings.retry.id, {
      targetNodeId: "node-9",
    })
    const cleared = applyRouteInNode(
      connected as typeof node,
      settings.retry.id,
      null,
    )
    const details = cleared?.data.details as typeof node.data.details
    expect(details.quickReplySettings?.retry.target).toBeNull()
    expect(details.quickReplySettings?.retry.id).toBe(settings.retry.id)
  })

  test("an unrelated handle id leaves the node untouched", () => {
    const { node } = makeNode()
    expect(applyRouteInNode(node, "nope", { targetNodeId: "x" })).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @chatbotx.io/flow-config exec vitest run __tests__/routable-handle.test.ts -t "quick reply settings handles"`
Expected: FAIL — `applyRouteInNode` returns `null`.

- [ ] **Step 3: Implement the accessor**

In `packages/flow-config/src/routable-handle.ts`:

Add import:
```ts
import type { QuickReplySettings } from "./steps/quick-reply-settings"
```

Add to `routableHandleKinds`:
```ts
  quickReplySettings: "quickReplySettings",
```

Add before `const routableHandleAccessors`:
```ts
/**
 * The two node-level handles under the quick replies. Their id belongs to the
 * section, not the target, so clearing a route keeps the handle drawable.
 * `stepIndex` is past every real step so a colliding step handle still wins,
 * matching {@link findButtonInNodes}'s earliest-step rule.
 */
const quickReplySettingsAccessor: RoutableHandleAccessor = {
  kind: routableHandleKinds.quickReplySettings,
  findButton: () => null,
  applyRoute: (node, handleId, route) => {
    const details = node.data.details as {
      quickReplySettings?: QuickReplySettings | null
    }
    const settings = details.quickReplySettings
    if (!settings) {
      return null
    }

    for (const key of ["followUp", "retry"] as const) {
      if (settings[key]?.id !== handleId) {
        continue
      }

      const target = route
        ? {
            buttonType: buttonTypes.enum.startAnotherNode,
            beforeStep: startAnotherNodeStepDefaultFn({
              nodeId: route.targetNodeId,
              viewOnly: true,
            }),
          }
        : null

      return {
        node: {
          ...node,
          data: {
            ...node.data,
            details: {
              ...node.data.details,
              quickReplySettings: {
                ...settings,
                [key]: { ...settings[key], target },
              },
            },
          },
        } as FlowNode,
        stepIndex: Number.MAX_SAFE_INTEGER,
      }
    }

    return null
  },
}
```

Append `quickReplySettingsAccessor` to the `routableHandleAccessors` array.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @chatbotx.io/flow-config exec vitest run __tests__/routable-handle.test.ts`
Expected: PASS (new and existing).

- [ ] **Step 5: Commit**

```bash
git add packages/flow-config/src/routable-handle.ts packages/flow-config/__tests__/routable-handle.test.ts
git commit -m "feat(flow-config): route canvas edges into quick reply settings"
```

---

### Task 3: database + worker-config — types, enum value, index, migrations

**Files:**
- Modify: `packages/database/src/partials/contact-on-smart-delay.ts:3`
- Modify: `packages/database/src/partials/conversation.ts:40-56`
- Modify: `packages/database/src/schema/contact-on-smart-delay.ts:89-96`
- Create: two migrations under `packages/database/` (generated)
- Modify: `packages/worker-config/src/queues/integration/index.ts:46` (action enum), `:348-373` (types), and the integration job union type in the same file
- Modify: `apps/worker/src/integration/handlers/get-user-data.ts:463-470`, `:705-712` (narrow)

**Interfaces:**
- Produces:
  - `smartDelayTypes.enum.quickReplyFollowUp`
  - `type ConversationStepChallenge = { type: "step"; data: { flowId; flowVersionId?; nodeId; stepId; attempts; lastAttemptAt: Date; appointmentId?; challengeId? } }`
  - `type ConversationQuickReplyChallenge = { type: "quickReply"; data: { flowId: string; flowVersionId?: string; nodeId: string; attempts: number; maxRetries: number; sentAt: Date } }`
  - `ConversationAttributes.challenge?: ConversationStepChallenge | ConversationQuickReplyChallenge`
  - `IntegrationJobRunChallenge.data.challenge: ConversationStepChallenge | ConversationQuickReplyChallenge`
  - `IntegrationJobAction.resumeQuickReplyFollowUp`, `type IntegrationJobResumeQuickReplyFollowUp = { type: typeof IntegrationJobAction.resumeQuickReplyFollowUp; data: { smartDelayId: string } }`

- [ ] **Step 1: Add the enum value (migration 1)**

`packages/database/src/partials/contact-on-smart-delay.ts`:
```ts
export const smartDelayTypes = z.enum([
  "waitNode",
  "followUp",
  "quickReplyFollowUp",
])
```

Run: `pnpm --filter @chatbotx.io/database make:migration add_quick_reply_follow_up_type`
Then open the generated `migration.sql`. It must contain only:
```sql
ALTER TYPE "public"."ContactOnSmartDelayType" ADD VALUE 'quickReplyFollowUp';
```
Delete any re-emitted, already-applied statements (known snapshot drift — see memory "Drizzle migration snapshot drift"). Show the SQL to the user. **Do not run `db:migrate`.**

- [ ] **Step 2: Add the partial unique index (migration 2)**

In `packages/database/src/schema/contact-on-smart-delay.ts`, after `ContactOnSmartDelay_followUp_active_key`:
```ts
    uniqueIndex("ContactOnSmartDelay_quickReplyFollowUp_active_key")
      .on(table.workspaceId, table.contactInboxId, table.flowId, table.nodeId)
      .where(
        // One active follow-up per quick-reply node; re-sending the node
        // restarts it through upsertQuickReplyFollowUp.
        sql`${table.status} NOT IN ('completed', 'failed', 'canceled') AND ${table.type} = 'quickReplyFollowUp'`,
      ),
```

Run: `pnpm --filter @chatbotx.io/database make:migration add_quick_reply_follow_up_index`
Expected SQL (trim anything else):
```sql
CREATE UNIQUE INDEX "ContactOnSmartDelay_quickReplyFollowUp_active_key" ON "ContactOnSmartDelay" USING btree ("workspaceId","contactInboxId","flowId","nodeId") WHERE "ContactOnSmartDelay"."status" NOT IN ('completed', 'failed', 'canceled') AND "ContactOnSmartDelay"."type" = 'quickReplyFollowUp';
```
Show the SQL to the user. **Do not run `db:migrate`.**

Run: `pnpm --filter @chatbotx.io/database db:check-drift`
Expected: exit 0 (no pending SQL).

- [ ] **Step 3: Conversation challenge union**

Replace the `ConversationAttributes` type in `packages/database/src/partials/conversation.ts`:
```ts
export type ConversationStepChallenge = {
  type: "step"
  data: {
    flowId: string
    flowVersionId?: string
    nodeId: string
    stepId: string
    attempts: number
    lastAttemptAt: Date
    appointmentId?: string
    challengeId?: string
  }
}

/** Pending "retry if reply isn't a quick reply" for a Send Message node. */
export type ConversationQuickReplyChallenge = {
  type: "quickReply"
  data: {
    flowId: string
    flowVersionId?: string
    nodeId: string
    attempts: number
    maxRetries: number
    sentAt: Date
  }
}

export type ConversationAttributes = {
  phoneNumber?: string
  challenge?: ConversationStepChallenge | ConversationQuickReplyChallenge
}
```

- [ ] **Step 4: worker-config job types**

In `packages/worker-config/src/queues/integration/index.ts`:
- Add `import type { ConversationQuickReplyChallenge, ConversationStepChallenge } from "@chatbotx.io/database/partials"` (merge into an existing `@chatbotx.io/database/partials` import if present).
- Add `resumeQuickReplyFollowUp: "resumeQuickReplyFollowUp",` next to `resumeFollowUp` in `IntegrationJobAction` (line ~46).
- Replace the inline `challenge: { type: "step"; data: {...} }` in `IntegrationJobRunChallenge` with:
```ts
    challenge: ConversationStepChallenge | ConversationQuickReplyChallenge
```
- Add after `IntegrationJobResumeFollowUp`:
```ts
export type IntegrationJobResumeQuickReplyFollowUp = {
  type: typeof IntegrationJobAction.resumeQuickReplyFollowUp
  data: { smartDelayId: string }
}
```
- Add `| IntegrationJobResumeQuickReplyFollowUp` to the integration job union type in this file (find it with `grep -n "IntegrationJobResumeFollowUp" packages/worker-config/src/queues/integration/index.ts`).

- [ ] **Step 5: Narrow getUserData readers**

In `apps/worker/src/integration/handlers/get-user-data.ts`, at both reads of `(... as ConversationAttributes | undefined)?.challenge` (lines ~463-470 and ~705-712), narrow to the step variant, e.g.:
```ts
  const pendingChallenge = (
    conversation.additionalAttributes as ConversationAttributes | undefined
  )?.challenge
  const existingChallenge =
    pendingChallenge?.type === "step" ? pendingChallenge : undefined
```
and use `existingChallenge` where the old variable was used. (Keep each site's original variable name for `existingChallenge`.)

- [ ] **Step 6: Typecheck everything that reads the type**

Run: `pnpm --filter @chatbotx.io/database check-types && pnpm --filter @chatbotx.io/worker-config check-types && pnpm --filter worker check-types && pnpm --filter builder check-types`
Expected:
- worker errors only in `handlers/smart-delay.ts` (`Record<SmartDelayType, …>` missing `quickReplyFollowUp`) and `handlers/challenge.ts` (`challenge.data.stepId` on the union). Those are fixed in Tasks 5–6; if any **other** file errors, narrow it with `challenge.type === "step"` the same way as Step 5.
- builder: `create-webchat-message.action.ts` compiles (it only forwards the challenge).

- [ ] **Step 7: Commit**

```bash
git add packages/database/src/partials/contact-on-smart-delay.ts packages/database/src/partials/conversation.ts packages/database/src/schema/contact-on-smart-delay.ts packages/database/migrations packages/worker-config/src/queues/integration/index.ts apps/worker/src/integration/handlers/get-user-data.ts
git commit -m "feat(database): add quick reply follow-up type and challenge variant"
```
(Replace `packages/database/migrations` with the two generated migration folders' exact paths.)

---

### Task 4: business — service methods and publish/handoff hooks

**Files:**
- Modify: `packages/business/src/smart-delay/service.ts` (new methods after `upsertFollowUp`, ~line 88)
- Modify: `packages/business/src/conversation/service.ts` (new methods after `restoreChallengeIfAbsent`, ~line 310; `updateBotEnabled` ~line 1094)
- Modify: `packages/business/src/flow-version/service.ts:376-441` (`publish`)

**Interfaces:**
- Consumes: `smartDelayTypes.enum.quickReplyFollowUp`, `ConversationQuickReplyChallenge` (Task 3)
- Produces (all accept optional `tx?: DatabaseClient`):
  - `smartDelayService.upsertQuickReplyFollowUp({ data: SmartDelayInsert }): Promise<SmartDelayRow>`
  - `smartDelayService.cancelQuickReplyFollowUps({ workspaceId: string; contactInboxId?: string; conversationIds?: string[]; exceptNodeId?: string; exceptFlowId?: string }): Promise<number>`
  - `smartDelayService.cancelQuickReplyFollowUpsForStaleVersion({ workspaceId: string; flowId: string; currentFlowVersionId: string }): Promise<number>`
  - `conversationService.clearQuickReplyChallenge({ workspaceId: string; conversationId: string; nodeId?: string; exceptFlowId?: string }): Promise<boolean>`
  - `conversationService.setQuickReplyChallengeAttempts({ workspaceId: string; conversationId: string; nodeId: string; fromAttempts: number; toAttempts: number }): Promise<boolean>`
  - `conversationService.clearQuickReplyChallengesForStaleVersion({ workspaceId: string; flowId: string; currentFlowVersionId: string }): Promise<number>`

These are SQL-only methods; they are exercised through the worker tests (mocked) in Tasks 5–6 and by typecheck here. Keep each one a single statement.

- [ ] **Step 1: Smart delay methods**

In `packages/business/src/smart-delay/service.ts` add (reuse the file's existing imports; add `ne`, `isNotNull`, `inArray`, `and`, `eq` from `drizzle-orm` if not already imported):

```ts
  async upsertQuickReplyFollowUp(props: {
    tx?: DatabaseClient
    data: SmartDelayInsert
  }): Promise<SmartDelayRow> {
    const { tx = db, data } = props
    const now = new Date()
    const [row] = await tx
      .insert(contactOnSmartDelayModel)
      .values(data)
      .onConflictDoUpdate({
        target: [
          contactOnSmartDelayModel.workspaceId,
          contactOnSmartDelayModel.contactInboxId,
          contactOnSmartDelayModel.flowId,
          contactOnSmartDelayModel.nodeId,
        ],
        targetWhere: sql`${contactOnSmartDelayModel.status} NOT IN ('completed', 'failed', 'canceled') AND ${contactOnSmartDelayModel.type} = 'quickReplyFollowUp'`,
        set: {
          conversationId: data.conversationId,
          appointmentId: data.appointmentId,
          createdAt: now,
          flowVersionId: data.flowVersionId,
          metadata: data.metadata,
          stepId: data.stepId,
          status: smartDelayStatuses.enum.pending,
          triggerAt: data.triggerAt,
        },
      })
      .returning()

    if (!row) {
      throw new Error("Failed to upsert quick reply follow-up smart delay")
    }

    return toSmartDelayRow(row)
  }

  /**
   * Cancels active quick-reply follow-ups. A canceled row can never run:
   * the resume handler requires `status = 'scheduled'`, and `resetToPending`
   * only moves `scheduled` rows.
   */
  async cancelQuickReplyFollowUps(props: {
    tx?: DatabaseClient
    workspaceId: string
    contactInboxId?: string
    conversationIds?: string[]
    exceptNodeId?: string
    exceptFlowId?: string
  }): Promise<number> {
    const { tx = db } = props
    if (!(props.contactInboxId || props.conversationIds?.length)) {
      return 0
    }

    const rows = await tx
      .update(contactOnSmartDelayModel)
      .set({ status: smartDelayStatuses.enum.canceled })
      .where(
        and(
          eq(contactOnSmartDelayModel.workspaceId, props.workspaceId),
          eq(
            contactOnSmartDelayModel.type,
            smartDelayTypes.enum.quickReplyFollowUp,
          ),
          inArray(contactOnSmartDelayModel.status, [
            smartDelayStatuses.enum.pending,
            smartDelayStatuses.enum.scheduled,
          ]),
          props.contactInboxId
            ? eq(contactOnSmartDelayModel.contactInboxId, props.contactInboxId)
            : undefined,
          props.conversationIds?.length
            ? inArray(
                contactOnSmartDelayModel.conversationId,
                props.conversationIds,
              )
            : undefined,
          props.exceptNodeId
            ? ne(contactOnSmartDelayModel.nodeId, props.exceptNodeId)
            : undefined,
          props.exceptFlowId
            ? ne(contactOnSmartDelayModel.flowId, props.exceptFlowId)
            : undefined,
        ),
      )
      .returning({ id: contactOnSmartDelayModel.id })

    return rows.length
  }

  async cancelQuickReplyFollowUpsForStaleVersion(props: {
    tx?: DatabaseClient
    workspaceId: string
    flowId: string
    currentFlowVersionId: string
  }): Promise<number> {
    const { tx = db } = props
    const rows = await tx
      .update(contactOnSmartDelayModel)
      .set({ status: smartDelayStatuses.enum.canceled })
      .where(
        and(
          eq(contactOnSmartDelayModel.workspaceId, props.workspaceId),
          eq(contactOnSmartDelayModel.flowId, props.flowId),
          eq(
            contactOnSmartDelayModel.type,
            smartDelayTypes.enum.quickReplyFollowUp,
          ),
          inArray(contactOnSmartDelayModel.status, [
            smartDelayStatuses.enum.pending,
            smartDelayStatuses.enum.scheduled,
          ]),
          isNotNull(contactOnSmartDelayModel.flowVersionId),
          ne(contactOnSmartDelayModel.flowVersionId, props.currentFlowVersionId),
        ),
      )
      .returning({ id: contactOnSmartDelayModel.id })

    return rows.length
  }
```

- [ ] **Step 2: Conversation challenge methods**

In `packages/business/src/conversation/service.ts`, after `restoreChallengeIfAbsent`:

```ts
  /**
   * Clears a pending quick-reply retry. Never touches a Get User Data
   * (`type: "step"`) challenge. Returns whether a row changed, so concurrent
   * callers can tell who won.
   */
  async clearQuickReplyChallenge(props: {
    tx?: DatabaseClient
    workspaceId: string
    conversationId: string
    nodeId?: string
    exceptFlowId?: string
  }): Promise<boolean> {
    const { tx = db } = props
    const challenge = sql`${conversationModel.additionalAttributes}->'challenge'`
    const rows = await tx
      .update(conversationModel)
      .set({
        additionalAttributes: sql`${conversationModel.additionalAttributes} - 'challenge'`,
      })
      .where(
        and(
          eq(conversationModel.workspaceId, props.workspaceId),
          eq(conversationModel.id, props.conversationId),
          sql`${challenge}->>'type' = 'quickReply'`,
          props.nodeId
            ? sql`${challenge}->'data'->>'nodeId' = ${props.nodeId}`
            : undefined,
          props.exceptFlowId
            ? sql`${challenge}->'data'->>'flowId' <> ${props.exceptFlowId}`
            : undefined,
        ),
      )
      .returning({ id: conversationModel.id })

    return rows.length > 0
  }

  /** Compare-and-set on `attempts`: only one concurrent retry wins. */
  async setQuickReplyChallengeAttempts(props: {
    tx?: DatabaseClient
    workspaceId: string
    conversationId: string
    nodeId: string
    fromAttempts: number
    toAttempts: number
  }): Promise<boolean> {
    const { tx = db } = props
    const challenge = sql`${conversationModel.additionalAttributes}->'challenge'`
    const rows = await tx
      .update(conversationModel)
      .set({
        additionalAttributes: sql`jsonb_set(${conversationModel.additionalAttributes}, '{challenge,data,attempts}', to_jsonb(${props.toAttempts}::int), false)`,
      })
      .where(
        and(
          eq(conversationModel.workspaceId, props.workspaceId),
          eq(conversationModel.id, props.conversationId),
          sql`${challenge}->>'type' = 'quickReply'`,
          sql`${challenge}->'data'->>'nodeId' = ${props.nodeId}`,
          sql`(${challenge}->'data'->>'attempts')::int = ${props.fromAttempts}`,
        ),
      )
      .returning({ id: conversationModel.id })

    return rows.length > 0
  }

  async clearQuickReplyChallengesForStaleVersion(props: {
    tx?: DatabaseClient
    workspaceId: string
    flowId: string
    currentFlowVersionId: string
  }): Promise<number> {
    const { tx = db } = props
    const challenge = sql`${conversationModel.additionalAttributes}->'challenge'`
    const rows = await tx
      .update(conversationModel)
      .set({
        additionalAttributes: sql`${conversationModel.additionalAttributes} - 'challenge'`,
      })
      .where(
        and(
          eq(conversationModel.workspaceId, props.workspaceId),
          sql`${challenge}->>'type' = 'quickReply'`,
          sql`${challenge}->'data'->>'flowId' = ${props.flowId}`,
          sql`${challenge}->'data'->>'flowVersionId' IS NOT NULL`,
          sql`${challenge}->'data'->>'flowVersionId' <> ${props.currentFlowVersionId}`,
        ),
      )
      .returning({ id: conversationModel.id })

    return rows.length
  }
```

- [ ] **Step 3: Clear on handoff (`updateBotEnabled`)**

In `updateBotEnabled` (line ~1094), change the `.set({ botEnabled, botResumeAt })` to also drop a quick-reply challenge when disabling, and cancel follow-ups after the update:

```ts
    await tx
      .update(conversationModel)
      .set({
        botEnabled,
        botResumeAt,
        ...(botEnabled
          ? {}
          : {
              additionalAttributes: sql`CASE WHEN ${conversationModel.additionalAttributes}->'challenge'->>'type' = 'quickReply' THEN ${conversationModel.additionalAttributes} - 'challenge' ELSE ${conversationModel.additionalAttributes} END`,
            }),
      })
      .where(/* unchanged */)

    if (!botEnabled) {
      await smartDelayService.cancelQuickReplyFollowUps({
        tx,
        workspaceId,
        conversationIds: ids,
      })
    }
```
Add `import { smartDelayService } from "../smart-delay/service"` (check `packages/business/src/smart-delay/service.ts` does not import the conversation service — it doesn't today, so no cycle).

- [ ] **Step 4: Clear on publish**

In `packages/business/src/flow-version/service.ts` `publish`:
- Hoist `let newVersionId: string | null = null` above `db.transaction(...)` and assign `newVersionId = createId()` where it's created now (keep using the variable inside the transaction).
- After `await this.invalidateCacheTags(...)`, before `this.audit(...)`:

```ts
    if (newVersionId) {
      try {
        await Promise.all([
          smartDelayService.cancelQuickReplyFollowUpsForStaleVersion({
            workspaceId: input.workspaceId,
            flowId: flow.id,
            currentFlowVersionId: newVersionId,
          }),
          conversationService.clearQuickReplyChallengesForStaleVersion({
            workspaceId: input.workspaceId,
            flowId: flow.id,
            currentFlowVersionId: newVersionId,
          }),
        ])
      } catch (error) {
        // Publishing must not fail on cleanup; stale state resolves itself
        // at the worker (missing node / settings off → clear + stop).
        logger.warn(
          { err: error, flowId: flow.id },
          "publish: failed to clear pending quick reply state",
        )
      }
    }
```
Imports: `import { conversationService } from "../conversation/service"`, `import { logger } from "../logger"`, `import { smartDelayService } from "../smart-delay/service"`. Then run `pnpm check:circular`; if it reports a new cycle through `conversation/service` ↔ `flow-version/service`, stop and report instead of working around it.

- [ ] **Step 5: Typecheck + circular check**

Run: `pnpm --filter @chatbotx.io/business check-types && pnpm check:circular`
Expected: PASS, no new cycles.

- [ ] **Step 6: Commit**

```bash
git add packages/business/src/smart-delay/service.ts packages/business/src/conversation/service.ts packages/business/src/flow-version/service.ts
git commit -m "feat(business): quick reply follow-up and challenge service methods"
```

---

### Task 5: worker — arm after send, clear on other flow / tap

**Files:**
- Create: `apps/worker/src/integration/handlers/quick-reply-settings.ts`
- Modify: `apps/worker/src/integration/handlers/smart-delay.ts:71-105` (factories + persistence)
- Modify: `apps/worker/src/integration/handlers/flow.ts:374-395` (node entry), `:440-448` (after carrier send), `runFlowAction` before its `runStepsAndQuickReplies` call (~line 1003)
- Test: `apps/worker/__tests__/quick-reply-settings.test.ts`, extend `apps/worker/__tests__/flow.test.ts`

**Interfaces:**
- Consumes: `resolveActiveQuickReplySettings`, `computeQuickReplyFollowUpTriggerAt` (Task 1); service methods (Task 4); `scheduleSmartDelayResume` (existing, `handlers/smart-delay.ts:107`)
- Produces:
  - `armQuickReplySettings(props: { workspaceId: string; conversationId: string; contactInboxId: string; flowId: string; flowVersionId: string | null; nodeId: string; details: unknown; metadata?: MetadataPayload; sendFrom?: "inbox" }): Promise<void>` — never throws.
  - `clearQuickReplyPendingOnFlowEntry(props: { workspaceId: string; conversation: { id: string; additionalAttributes: unknown }; contactInboxId: string; flowId: string }): Promise<void>` — never throws.
  - `clearQuickReplyChallengeOnTap(props: { workspaceId: string; conversation: { id: string; additionalAttributes: unknown } }): Promise<void>` — never throws.
  - `buildResumeQuickReplyFollowUpJob(row)` in `smart-delay.ts`, registered for `quickReplyFollowUp`.

- [ ] **Step 1: Write the failing module test**

Create `apps/worker/__tests__/quick-reply-settings.test.ts`:

```ts
import { quickReplySettingsDefaultFn } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  conversationService: {
    updateChallenge: vi.fn(async () => undefined),
    clearQuickReplyChallenge: vi.fn(async () => true),
  },
  smartDelayService: {
    cancelQuickReplyFollowUps: vi.fn(async () => 0),
  },
  scheduleSmartDelayResume: vi.fn(async () => undefined),
  logger: { warn: vi.fn(), info: vi.fn() },
}))

vi.mock("@chatbotx.io/business", () => ({
  conversationService: mocks.conversationService,
}))
vi.mock("@chatbotx.io/business/smart-delay", () => ({
  smartDelayService: mocks.smartDelayService,
}))
vi.mock("../src/integration/handlers/smart-delay", () => ({
  scheduleSmartDelayResume: mocks.scheduleSmartDelayResume,
}))
vi.mock("../src/lib/logger", () => ({ logger: mocks.logger }))

const {
  armQuickReplySettings,
  clearQuickReplyChallengeOnTap,
  clearQuickReplyPendingOnFlowEntry,
} = await import("../src/integration/handlers/quick-reply-settings")

const target = {
  buttonType: "startAnotherNode" as const,
  beforeStep: { id: "9", stepType: "startAnotherNode", nodeId: "node-2", viewOnly: true },
}

function makeDetails(configure: (s: ReturnType<typeof quickReplySettingsDefaultFn>) => void) {
  const settings = quickReplySettingsDefaultFn()
  configure(settings)
  return {
    steps: [],
    quickReplies: [{ id: "qr-1", label: "Yes", buttonType: null, beforeStep: null, steps: [] }],
    quickReplySettings: settings,
  }
}

const base = {
  workspaceId: "ws-1",
  conversationId: "conv-1",
  contactInboxId: "ci-1",
  flowId: "flow-1",
  flowVersionId: null,
  nodeId: "node-1",
}

describe("armQuickReplySettings", () => {
  beforeEach(() => vi.clearAllMocks())

  test("does nothing for a legacy node without settings", async () => {
    await armQuickReplySettings({
      ...base,
      details: { steps: [], quickReplies: [{ id: "qr-1" }] },
    })
    expect(mocks.conversationService.updateChallenge).not.toHaveBeenCalled()
    expect(mocks.scheduleSmartDelayResume).not.toHaveBeenCalled()
    // A previous node's retry is superseded even when this node has none.
    expect(mocks.conversationService.clearQuickReplyChallenge).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
    })
  })

  test("writes a quickReply challenge when retry is on", async () => {
    await armQuickReplySettings({
      ...base,
      details: makeDetails((s) => {
        s.retry = { ...s.retry, enabled: true, message: "Tap", maxRetries: 2, target }
      }),
    })
    expect(mocks.conversationService.updateChallenge).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      challenge: {
        type: "quickReply",
        data: expect.objectContaining({
          flowId: "flow-1",
          nodeId: "node-1",
          attempts: 0,
          maxRetries: 2,
        }),
      },
    })
  })

  test("schedules a follow-up and supersedes other nodes' follow-ups", async () => {
    const details = makeDetails((s) => {
      s.followUp = { ...s.followUp, enabled: true, duration: 10, unit: "minutes", target }
    })
    await armQuickReplySettings({ ...base, details })
    expect(mocks.smartDelayService.cancelQuickReplyFollowUps).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      exceptNodeId: "node-1",
    })
    expect(mocks.scheduleSmartDelayResume).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "quickReplyFollowUp",
        connectedNodeId: "node-1",
        stepId: details.quickReplySettings.followUp.id,
        flowVersionId: null,
      }),
    )
  })

  test("swallows service errors so the flow keeps running", async () => {
    mocks.conversationService.updateChallenge.mockRejectedValueOnce(new Error("db down"))
    await expect(
      armQuickReplySettings({
        ...base,
        details: makeDetails((s) => {
          s.retry = { ...s.retry, enabled: true, message: "Tap", target }
        }),
      }),
    ).resolves.toBeUndefined()
    expect(mocks.logger.warn).toHaveBeenCalled()
  })
})

describe("clearQuickReplyPendingOnFlowEntry", () => {
  beforeEach(() => vi.clearAllMocks())

  test("same flow keeps the challenge (Continue edge case)", async () => {
    await clearQuickReplyPendingOnFlowEntry({
      workspaceId: "ws-1",
      conversation: {
        id: "conv-1",
        additionalAttributes: {
          challenge: { type: "quickReply", data: { flowId: "flow-1", nodeId: "node-1" } },
        },
      },
      contactInboxId: "ci-1",
      flowId: "flow-1",
    })
    expect(mocks.conversationService.clearQuickReplyChallenge).not.toHaveBeenCalled()
    expect(mocks.smartDelayService.cancelQuickReplyFollowUps).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      exceptFlowId: "flow-1",
    })
  })

  test("a different flow clears the challenge", async () => {
    await clearQuickReplyPendingOnFlowEntry({
      workspaceId: "ws-1",
      conversation: {
        id: "conv-1",
        additionalAttributes: {
          challenge: { type: "quickReply", data: { flowId: "flow-1", nodeId: "node-1" } },
        },
      },
      contactInboxId: "ci-1",
      flowId: "flow-2",
    })
    expect(mocks.conversationService.clearQuickReplyChallenge).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      exceptFlowId: "flow-2",
    })
  })

  test("never clears a Get User Data challenge", async () => {
    await clearQuickReplyPendingOnFlowEntry({
      workspaceId: "ws-1",
      conversation: {
        id: "conv-1",
        additionalAttributes: {
          challenge: { type: "step", data: { flowId: "flow-1", nodeId: "n", stepId: "s" } },
        },
      },
      contactInboxId: "ci-1",
      flowId: "flow-2",
    })
    expect(mocks.conversationService.clearQuickReplyChallenge).not.toHaveBeenCalled()
  })
})

describe("clearQuickReplyChallengeOnTap", () => {
  beforeEach(() => vi.clearAllMocks())

  test("clears only when a quickReply challenge is pending", async () => {
    await clearQuickReplyChallengeOnTap({
      workspaceId: "ws-1",
      conversation: { id: "conv-1", additionalAttributes: {} },
    })
    expect(mocks.conversationService.clearQuickReplyChallenge).not.toHaveBeenCalled()

    await clearQuickReplyChallengeOnTap({
      workspaceId: "ws-1",
      conversation: {
        id: "conv-1",
        additionalAttributes: { challenge: { type: "quickReply", data: { flowId: "f", nodeId: "n" } } },
      },
    })
    expect(mocks.conversationService.clearQuickReplyChallenge).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
    })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter worker exec vitest run __tests__/quick-reply-settings.test.ts`
Expected: FAIL — module `../src/integration/handlers/quick-reply-settings` not found.

- [ ] **Step 3: Implement the module**

Create `apps/worker/src/integration/handlers/quick-reply-settings.ts`:

```ts
import { conversationService } from "@chatbotx.io/business"
import { smartDelayService } from "@chatbotx.io/business/smart-delay"
import {
  type ConversationAttributes,
  smartDelayTypes,
} from "@chatbotx.io/database/partials"
import {
  computeQuickReplyFollowUpTriggerAt,
  type MetadataPayload,
  resolveActiveQuickReplySettings,
} from "@chatbotx.io/flow-config"
import { logger } from "../../lib/logger"
import { scheduleSmartDelayResume } from "./smart-delay"

// This module must not import ./flow — flow.ts imports it. Routing to a
// target lives in ./quick-reply-resume.

const pendingQuickReplyChallenge = (additionalAttributes: unknown) => {
  const challenge = (additionalAttributes as ConversationAttributes | undefined)
    ?.challenge
  return challenge?.type === "quickReply" ? challenge : undefined
}

/**
 * Called right after a node's quick-reply carrier step has been sent. The
 * latest quick-reply node always supersedes an earlier one's pending state.
 */
export async function armQuickReplySettings(props: {
  workspaceId: string
  conversationId: string
  contactInboxId: string
  flowId: string
  flowVersionId: string | null
  nodeId: string
  details: unknown
  metadata?: MetadataPayload
  sendFrom?: "inbox"
}): Promise<void> {
  const active = resolveActiveQuickReplySettings(props.details)

  try {
    if (active.retry) {
      await conversationService.updateChallenge({
        workspaceId: props.workspaceId,
        conversationId: props.conversationId,
        challenge: {
          type: "quickReply",
          data: {
            flowId: props.flowId,
            flowVersionId: props.flowVersionId ?? undefined,
            nodeId: props.nodeId,
            attempts: 0,
            maxRetries: active.retry.maxRetries,
            sentAt: new Date(),
          },
        },
      })
    } else {
      await conversationService.clearQuickReplyChallenge({
        workspaceId: props.workspaceId,
        conversationId: props.conversationId,
      })
    }

    if (active.followUp) {
      await smartDelayService.cancelQuickReplyFollowUps({
        workspaceId: props.workspaceId,
        contactInboxId: props.contactInboxId,
        exceptNodeId: props.nodeId,
      })
      await scheduleSmartDelayResume({
        type: smartDelayTypes.enum.quickReplyFollowUp,
        triggerAt: computeQuickReplyFollowUpTriggerAt(active.followUp),
        workspaceId: props.workspaceId,
        flowId: props.flowId,
        flowVersionId: props.flowVersionId,
        conversationId: props.conversationId,
        contactInboxId: props.contactInboxId,
        connectedNodeId: props.nodeId,
        stepId: active.followUp.id,
        metadata: props.metadata,
        sendFrom: props.sendFrom,
      })
    }
  } catch (error) {
    logger.warn(
      { err: error, nodeId: props.nodeId, conversationId: props.conversationId },
      "armQuickReplySettings: failed to arm quick reply settings",
    )
  }
}

/** A real node entry of another flow ends this contact's pending state. */
export async function clearQuickReplyPendingOnFlowEntry(props: {
  workspaceId: string
  conversation: { id: string; additionalAttributes: unknown }
  contactInboxId: string
  flowId: string
}): Promise<void> {
  try {
    const challenge = pendingQuickReplyChallenge(
      props.conversation.additionalAttributes,
    )
    await Promise.all([
      challenge && challenge.data.flowId !== props.flowId
        ? conversationService.clearQuickReplyChallenge({
            workspaceId: props.workspaceId,
            conversationId: props.conversation.id,
            exceptFlowId: props.flowId,
          })
        : undefined,
      smartDelayService.cancelQuickReplyFollowUps({
        workspaceId: props.workspaceId,
        contactInboxId: props.contactInboxId,
        exceptFlowId: props.flowId,
      }),
    ])
  } catch (error) {
    logger.warn(
      { err: error, conversationId: props.conversation.id },
      "clearQuickReplyPendingOnFlowEntry: failed to clear pending state",
    )
  }
}

/** Any tapped button/quick reply ends a pending retry. */
export async function clearQuickReplyChallengeOnTap(props: {
  workspaceId: string
  conversation: { id: string; additionalAttributes: unknown }
}): Promise<void> {
  if (!pendingQuickReplyChallenge(props.conversation.additionalAttributes)) {
    return
  }
  try {
    await conversationService.clearQuickReplyChallenge({
      workspaceId: props.workspaceId,
      conversationId: props.conversation.id,
    })
  } catch (error) {
    logger.warn(
      { err: error, conversationId: props.conversation.id },
      "clearQuickReplyChallengeOnTap: failed to clear challenge",
    )
  }
}
```

If `MetadataPayload` is not exported from `@chatbotx.io/flow-config`, import it from the same place `handlers/smart-delay.ts` imports it.

- [ ] **Step 4: Register the smart delay type**

In `apps/worker/src/integration/handlers/smart-delay.ts`:
- Add a job factory next to `buildResumeFollowUpJob`:
```ts
const buildResumeQuickReplyFollowUpJob = (row: SmartDelayRow): SmartDelayJobSpec => ({
  name: IntegrationJobAction.resumeQuickReplyFollowUp,
  data: {
    type: IntegrationJobAction.resumeQuickReplyFollowUp,
    data: { smartDelayId: row.id },
  },
})
```
(Mirror `buildResumeFollowUpJob`'s exact return shape — copy it and change the action.)
- Add `[smartDelayTypes.enum.quickReplyFollowUp]: buildResumeQuickReplyFollowUpJob` to `smartDelayResumeJobFactories`.
- Add `[smartDelayTypes.enum.quickReplyFollowUp]: (data) => smartDelayService.upsertQuickReplyFollowUp({ data })` to `smartDelayPersistenceHandlers` (mirror the `followUp` entry's shape).

Run: `grep -rn "Record<SmartDelayType" apps packages | grep -v __tests__`
Expected: every hit now has a `quickReplyFollowUp` key (fix any other hit the same way).

- [ ] **Step 5: Wire into flow.ts**

In `apps/worker/src/integration/handlers/flow.ts`, import:
```ts
import {
  armQuickReplySettings,
  clearQuickReplyChallengeOnTap,
  clearQuickReplyPendingOnFlowEntry,
} from "./quick-reply-settings"
```

(a) Node entry — inside `runStepsAndQuickReplies`, immediately **after** the `if (!props.startFromStepId && props.targetNodeId) { … }` loop-guard block (so a stopped loop does not clear anything), add:
```ts
  if (targetType === "node" && !props.startFromStepId && props.targetNodeId) {
    await clearQuickReplyPendingOnFlowEntry({
      workspaceId: props.conversation.workspaceId,
      conversation: props.conversation,
      contactInboxId: props.contactInbox.id,
      flowId: flowVersion.flowId,
    })
  }
```

(b) After the carrier send — right after `remainingAnchor = result?.commentAnchor`:
```ts
    if (
      targetType === "node" &&
      quickReplies.length > 0 &&
      quickReplyCarrier?.id === currentStep.id &&
      result?.status !== "wait" &&
      result?.status !== "retry"
    ) {
      await armQuickReplySettings({
        workspaceId: props.conversation.workspaceId,
        conversationId: props.conversation.id,
        contactInboxId: props.contactInbox.id,
        flowId: flowVersion.flowId,
        flowVersionId: props.useLatestFlowVersion ? null : flowVersion.id,
        nodeId: targetId,
        details,
        metadata: props.metadata,
        sendFrom: props.sendFrom,
      })
    }
```

(c) Tap — in `runFlowAction`, immediately before its `await runStepsAndQuickReplies({ … targetType: target.targetType … })` call (~line 1003):
```ts
  await clearQuickReplyChallengeOnTap({
    workspaceId: conversation.workspaceId,
    conversation,
  })
```

- [ ] **Step 6: flow.test.ts cases**

In `apps/worker/__tests__/flow.test.ts`, next to the other top-level `vi.mock` calls (before the `await import` of `../src/integration/handlers/flow`), add:
```ts
const armQuickReplySettings = vi.fn(async () => undefined)
const clearQuickReplyPendingOnFlowEntry = vi.fn(async () => undefined)
const clearQuickReplyChallengeOnTap = vi.fn(async () => undefined)
vi.mock("../src/integration/handlers/quick-reply-settings", () => ({
  armQuickReplySettings: (...args: unknown[]) => armQuickReplySettings(...(args as [never])),
  clearQuickReplyPendingOnFlowEntry: (...args: unknown[]) =>
    clearQuickReplyPendingOnFlowEntry(...(args as [never])),
  clearQuickReplyChallengeOnTap: (...args: unknown[]) =>
    clearQuickReplyChallengeOnTap(...(args as [never])),
}))
```

Append:
```ts
describe("runStepsAndQuickReplies — quick reply settings", () => {
  beforeEach(() => {
    integrationQueueAdd.mockClear()
    armQuickReplySettings.mockClear()
    clearQuickReplyPendingOnFlowEntry.mockClear()
  })

  const quickReply = {
    id: "qr-1",
    label: "Yes",
    buttonType: null,
    beforeStep: null,
    steps: [],
  } as unknown as ButtonStepProps

  test("arms after the carrier step on a node entry", async () => {
    const flowVersion = makeFlowVersion([], [])
    const details = {
      steps: [{ id: "s-1", stepType: stepTypes.enum.sendText, text: "Hi", buttons: [] }],
      quickReplies: [quickReply],
    }
    await runStepsAndQuickReplies({
      ...makeBaseProps(flowVersion),
      details,
      targetType: "node",
      targetId: "node-1",
      targetNodeId: "node-1",
    })
    expect(clearQuickReplyPendingOnFlowEntry).toHaveBeenCalledOnce()
    expect(armQuickReplySettings).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: "node-1", details }),
    )
  })

  test("does not arm or clear for a tapped quick reply target", async () => {
    const flowVersion = makeFlowVersion([], [])
    await runStepsAndQuickReplies({
      ...makeBaseProps(flowVersion),
      details: quickReply,
      targetType: "quickReply",
      targetId: "qr-1",
      targetNodeId: "node-1",
    })
    expect(armQuickReplySettings).not.toHaveBeenCalled()
    expect(clearQuickReplyPendingOnFlowEntry).not.toHaveBeenCalled()
  })
})
```
And inside the existing `describe("flow action target resolution")`, add:
```ts
  test("a quick reply tap clears a pending quick reply retry", async () => {
    mockFlowWithReply({ steps: [], quickReplies: [makeQuickReply(REPLY_ID, "Yes")] })
    await runFlowQuickReply({
      conversationId: "conversation-1",
      contactInboxId: "contact-inbox-1",
      action: replyAction(),
    } as never)
    expect(clearQuickReplyChallengeOnTap).toHaveBeenCalledOnce()
  })
```
(Use the same call shape the neighbouring `runFlowQuickReply` tests in that `describe` use — copy their argument object.)

- [ ] **Step 7: Run tests**

Run: `pnpm --filter worker exec vitest run __tests__/quick-reply-settings.test.ts __tests__/flow.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/worker/src/integration/handlers/quick-reply-settings.ts apps/worker/src/integration/handlers/smart-delay.ts apps/worker/src/integration/handlers/flow.ts apps/worker/__tests__/quick-reply-settings.test.ts apps/worker/__tests__/flow.test.ts
git commit -m "feat(worker): arm and clear quick reply settings"
```

---

### Task 6: worker — retry loop, follow-up resume, routing to target

**Files:**
- Create: `apps/worker/src/integration/handlers/quick-reply-resume.ts`
- Modify: `apps/worker/src/integration/handlers/challenge.ts:11-22`
- Modify: `apps/worker/src/integration/worker.ts:389-392` (add case)
- Test: `apps/worker/__tests__/quick-reply-resume.test.ts`, extend `apps/worker/__tests__/challenge-handler.test.ts`

**Interfaces:**
- Consumes: `resolveActiveQuickReplySettings` (Task 1); `conversationService.clearQuickReplyChallenge`, `setQuickReplyChallengeAttempts`, `ensureActive`; `smartDelayService.findById`, `claimForRun`; `contactInboxService.hasIncomingMessageSince`; `detectConversationAndContactInbox`, `detectFlowVersion` (`../../lib/db`); `enqueueFlowStepMessage` (`./flow-utils`); `runStepsAndQuickReplies` (`./flow`)
- Produces:
  - `runQuickReplyChallenge(props: { conversation: ConversationModel; contactInbox: ContactInboxModel; challenge: ConversationQuickReplyChallenge }): Promise<void>`
  - `runQuickReplyFollowUpResume(data: { smartDelayId: string }): Promise<void>`
  - `routeQuickReplyTarget(props: { conversation; contactInbox; flowVersion; useLatestFlowVersion: boolean; sourceNodeId: string; section: { id: string; target: QuickReplyNextStep }; metadata?: MetadataPayload }): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `apps/worker/__tests__/quick-reply-resume.test.ts`:

```ts
import { quickReplySettingsDefaultFn } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  conversationService: {
    clearQuickReplyChallenge: vi.fn(async () => true),
    setQuickReplyChallengeAttempts: vi.fn(async () => true),
    ensureActive: vi.fn(async () => true),
  },
  contactInboxService: { hasIncomingMessageSince: vi.fn(async () => false) },
  smartDelayService: {
    findById: vi.fn(),
    claimForRun: vi.fn(async () => true),
  },
  detectConversationAndContactInbox: vi.fn(),
  detectFlowVersion: vi.fn(),
  enqueueFlowStepMessage: vi.fn(async () => undefined),
  runStepsAndQuickReplies: vi.fn(async () => undefined),
  initVariables: vi.fn(() => ({ conversation: {} })),
  logger: { warn: vi.fn(), info: vi.fn() },
}))

vi.mock("@chatbotx.io/business", () => ({
  conversationService: mocks.conversationService,
  contactInboxService: mocks.contactInboxService,
}))
vi.mock("@chatbotx.io/business/contact-inbox", () => ({
  contactInboxService: mocks.contactInboxService,
}))
vi.mock("@chatbotx.io/business/smart-delay", () => ({
  smartDelayService: mocks.smartDelayService,
}))
vi.mock("@chatbotx.io/sdk", () => ({ initVariables: mocks.initVariables }))
vi.mock("../src/lib/db", () => ({
  detectConversationAndContactInbox: mocks.detectConversationAndContactInbox,
  detectFlowVersion: mocks.detectFlowVersion,
}))
vi.mock("../src/integration/handlers/flow-utils", () => ({
  enqueueFlowStepMessage: mocks.enqueueFlowStepMessage,
}))
vi.mock("../src/integration/handlers/flow", () => ({
  runStepsAndQuickReplies: mocks.runStepsAndQuickReplies,
}))
vi.mock("../src/lib/logger", () => ({ logger: mocks.logger }))

const { runQuickReplyChallenge, runQuickReplyFollowUpResume } = await import(
  "../src/integration/handlers/quick-reply-resume"
)

const target = {
  buttonType: "startAnotherNode" as const,
  beforeStep: { id: "9", stepType: "startAnotherNode", nodeId: "node-2", viewOnly: true },
}
const quickReplies = [
  { id: "qr-1", label: "Yes", buttonType: null, beforeStep: null, steps: [] },
]

function mockFlow(configure: (s: ReturnType<typeof quickReplySettingsDefaultFn>) => void) {
  const settings = quickReplySettingsDefaultFn()
  configure(settings)
  mocks.detectFlowVersion.mockResolvedValue({
    flowVersion: {
      id: "fv-1",
      flowId: "flow-1",
      nodes: [
        {
          id: "node-1",
          data: { details: { steps: [], quickReplies, quickReplySettings: settings } },
        },
      ],
      edges: [],
    },
    useLatestFlowVersion: true,
  })
  return settings
}

const conversation = { id: "conv-1", workspaceId: "ws-1", additionalAttributes: {} }
const contactInbox = { id: "ci-1", channel: "messenger" }

function challenge(attempts: number, maxRetries = 3) {
  return {
    type: "quickReply" as const,
    data: { flowId: "flow-1", nodeId: "node-1", attempts, maxRetries, sentAt: new Date() },
  }
}

describe("runQuickReplyChallenge", () => {
  beforeEach(() => vi.clearAllMocks())

  test("sends the retry message with the node's quick replies and bumps attempts", async () => {
    const settings = mockFlow((s) => {
      s.retry = { ...s.retry, enabled: true, message: "Tap one", maxRetries: 3, target }
    })
    await runQuickReplyChallenge({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      challenge: challenge(1),
    })
    expect(mocks.conversationService.setQuickReplyChallengeAttempts).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      nodeId: "node-1",
      fromAttempts: 1,
      toAttempts: 2,
    })
    expect(mocks.enqueueFlowStepMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        flowId: "flow-1",
        quickReplies,
        step: expect.objectContaining({
          id: settings.retry.id,
          nodeId: "node-1",
          stepType: "sendText",
          text: "Tap one",
        }),
      }),
    )
    expect(mocks.runStepsAndQuickReplies).not.toHaveBeenCalled()
  })

  test("a concurrent message that loses the CAS sends nothing", async () => {
    mockFlow((s) => {
      s.retry = { ...s.retry, enabled: true, message: "Tap", target }
    })
    mocks.conversationService.setQuickReplyChallengeAttempts.mockResolvedValueOnce(false)
    await runQuickReplyChallenge({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      challenge: challenge(0),
    })
    expect(mocks.enqueueFlowStepMessage).not.toHaveBeenCalled()
  })

  test("a failed retry send rolls the attempt back", async () => {
    mockFlow((s) => {
      s.retry = { ...s.retry, enabled: true, message: "Tap", target }
    })
    mocks.enqueueFlowStepMessage.mockRejectedValueOnce(new Error("window closed"))
    await runQuickReplyChallenge({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      challenge: challenge(0),
    })
    expect(mocks.conversationService.setQuickReplyChallengeAttempts).toHaveBeenLastCalledWith(
      expect.objectContaining({ fromAttempts: 1, toAttempts: 0 }),
    )
    expect(mocks.logger.warn).toHaveBeenCalled()
  })

  test("exceeded retries clear the challenge and route to the target", async () => {
    const settings = mockFlow((s) => {
      s.retry = { ...s.retry, enabled: true, message: "Tap", maxRetries: 3, target }
    })
    await runQuickReplyChallenge({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      challenge: challenge(3),
    })
    expect(mocks.conversationService.clearQuickReplyChallenge).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      nodeId: "node-1",
    })
    expect(mocks.runStepsAndQuickReplies).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: "quickReply",
        targetId: settings.retry.id,
        targetNodeId: "node-1",
        details: expect.objectContaining({
          id: settings.retry.id,
          label: "",
          buttonType: "startAnotherNode",
          steps: [],
        }),
      }),
    )
  })

  test("0 retries routes on the first non quick reply message", async () => {
    mockFlow((s) => {
      s.retry = { ...s.retry, enabled: true, maxRetries: 0, target }
    })
    await runQuickReplyChallenge({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      challenge: challenge(0, 0),
    })
    expect(mocks.enqueueFlowStepMessage).not.toHaveBeenCalled()
    expect(mocks.runStepsAndQuickReplies).toHaveBeenCalledOnce()
  })

  test("stale state (retry turned off) clears and stops", async () => {
    mockFlow(() => undefined)
    await runQuickReplyChallenge({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      challenge: challenge(0),
    })
    expect(mocks.conversationService.clearQuickReplyChallenge).toHaveBeenCalled()
    expect(mocks.enqueueFlowStepMessage).not.toHaveBeenCalled()
    expect(mocks.runStepsAndQuickReplies).not.toHaveBeenCalled()
  })
})

describe("runQuickReplyFollowUpResume", () => {
  const row = {
    id: "sd-1",
    workspaceId: "ws-1",
    flowId: "flow-1",
    flowVersionId: null,
    contactInboxId: "ci-1",
    conversationId: "conv-1",
    nodeId: "node-1",
    stepId: "x",
    metadata: null,
    type: "quickReplyFollowUp",
    createdAt: new Date("2026-09-30T00:00:00.000Z"),
    triggerAt: new Date("2026-09-30T00:10:00.000Z"),
    status: "scheduled",
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-30T00:10:00.000Z"))
    mocks.smartDelayService.findById.mockResolvedValue(row)
    mocks.detectConversationAndContactInbox.mockResolvedValue({ conversation, contactInbox })
  })

  test("fires: completes the row, clears the challenge, routes to the follow-up target", async () => {
    const settings = mockFlow((s) => {
      s.followUp = { ...s.followUp, enabled: true, target }
    })
    await runQuickReplyFollowUpResume({ smartDelayId: "sd-1" })
    expect(mocks.smartDelayService.claimForRun).toHaveBeenCalledWith({ id: "sd-1", to: "completed" })
    expect(mocks.conversationService.clearQuickReplyChallenge).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      nodeId: "node-1",
    })
    expect(mocks.runStepsAndQuickReplies).toHaveBeenCalledWith(
      expect.objectContaining({ targetId: settings.followUp.id, targetType: "quickReply" }),
    )
  })

  test("contact replied since → cancel, no routing", async () => {
    mockFlow((s) => {
      s.followUp = { ...s.followUp, enabled: true, target }
    })
    mocks.contactInboxService.hasIncomingMessageSince.mockResolvedValueOnce(true)
    await runQuickReplyFollowUpResume({ smartDelayId: "sd-1" })
    expect(mocks.smartDelayService.claimForRun).toHaveBeenCalledWith({ id: "sd-1", to: "canceled" })
    expect(mocks.runStepsAndQuickReplies).not.toHaveBeenCalled()
  })

  test("bot paused / handed off → cancel, no routing", async () => {
    mockFlow((s) => {
      s.followUp = { ...s.followUp, enabled: true, target }
    })
    mocks.conversationService.ensureActive.mockResolvedValueOnce(false)
    await runQuickReplyFollowUpResume({ smartDelayId: "sd-1" })
    expect(mocks.smartDelayService.claimForRun).toHaveBeenCalledWith({ id: "sd-1", to: "canceled" })
    expect(mocks.runStepsAndQuickReplies).not.toHaveBeenCalled()
  })

  test("ignores rows of other types or statuses", async () => {
    mocks.smartDelayService.findById.mockResolvedValueOnce({ ...row, type: "followUp" })
    await runQuickReplyFollowUpResume({ smartDelayId: "sd-1" })
    expect(mocks.smartDelayService.claimForRun).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter worker exec vitest run __tests__/quick-reply-resume.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/worker/src/integration/handlers/quick-reply-resume.ts`:

```ts
import { contactInboxService, conversationService } from "@chatbotx.io/business"
import { smartDelayService } from "@chatbotx.io/business/smart-delay"
import {
  type ConversationQuickReplyChallenge,
  smartDelayStatuses,
  smartDelayTypes,
} from "@chatbotx.io/database/partials"
import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import {
  type ButtonStepProps,
  type FlowNode,
  type MetadataPayload,
  metadataSchema,
  type QuickReplyNextStep,
  resolveActiveQuickReplySettings,
  type SendTextStepSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import { initVariables } from "@chatbotx.io/sdk"
import {
  detectConversationAndContactInbox,
  detectFlowVersion,
} from "../../lib/db"
import { logger } from "../../lib/logger"
import { runStepsAndQuickReplies } from "./flow"
import { enqueueFlowStepMessage } from "./flow-utils"

type FlowVersion = Awaited<ReturnType<typeof detectFlowVersion>>["flowVersion"]

const findNodeDetails = (flowVersion: FlowVersion, nodeId: string) =>
  (flowVersion.nodes as unknown as FlowNode[]).find((node) => node.id === nodeId)
    ?.data.details

/**
 * Runs a settings target through the exact path a tapped quick reply takes,
 * so node jumps follow the section's edge and external targets run their
 * beforeStep.
 */
export async function routeQuickReplyTarget(props: {
  conversation: ConversationModel
  contactInbox: ContactInboxModel
  flowVersion: FlowVersion
  useLatestFlowVersion: boolean
  sourceNodeId: string
  section: { id: string; target: QuickReplyNextStep }
  metadata?: MetadataPayload
}): Promise<void> {
  const details = {
    id: props.section.id,
    label: "",
    ...props.section.target,
    steps: [],
  } as unknown as ButtonStepProps

  await runStepsAndQuickReplies({
    conversation: props.conversation,
    contactInbox: props.contactInbox,
    flowVersion: props.flowVersion,
    useLatestFlowVersion: props.useLatestFlowVersion,
    details,
    targetType: "quickReply",
    targetId: props.section.id,
    targetNodeId: props.sourceNodeId,
    ctx: { variables: initVariables() },
    metadata: props.metadata,
  })
}

export async function runQuickReplyChallenge(props: {
  conversation: ConversationModel
  contactInbox: ContactInboxModel
  challenge: ConversationQuickReplyChallenge
}): Promise<void> {
  const { conversation, contactInbox, challenge } = props
  const { workspaceId } = conversation
  const { nodeId } = challenge.data

  const { flowVersion, useLatestFlowVersion } = await detectFlowVersion({
    flowId: challenge.data.flowId,
    flowVersionId: challenge.data.flowVersionId,
    workspaceId,
  })
  const details = findNodeDetails(flowVersion, nodeId)
  const retry = resolveActiveQuickReplySettings(details).retry

  if (!(details && "quickReplies" in details && retry)) {
    await conversationService.clearQuickReplyChallenge({
      workspaceId,
      conversationId: conversation.id,
      nodeId,
    })
    logger.info(
      { conversationId: conversation.id, nodeId },
      "runQuickReplyChallenge: retry no longer configured, cleared",
    )
    return
  }

  const attempts = challenge.data.attempts
  if (attempts < retry.maxRetries) {
    const claimed = await conversationService.setQuickReplyChallengeAttempts({
      workspaceId,
      conversationId: conversation.id,
      nodeId,
      fromAttempts: attempts,
      toAttempts: attempts + 1,
    })
    if (!claimed) {
      return
    }

    const retryStep = {
      id: retry.id,
      nodeId,
      stepType: stepTypes.enum.sendText,
      text: retry.message,
      buttons: [],
    } as SendTextStepSchema

    try {
      await enqueueFlowStepMessage({
        conversationId: conversation.id,
        contactInboxId: contactInbox.id,
        flowId: flowVersion.flowId,
        flowVersionId: useLatestFlowVersion ? undefined : flowVersion.id,
        step: retryStep,
        quickReplies: details.quickReplies,
      })
    } catch (error) {
      // Not counted: give the attempt back so the next message retries.
      await conversationService.setQuickReplyChallengeAttempts({
        workspaceId,
        conversationId: conversation.id,
        nodeId,
        fromAttempts: attempts + 1,
        toAttempts: attempts,
      })
      logger.warn(
        { err: error, conversationId: conversation.id, nodeId },
        "runQuickReplyChallenge: failed to send retry message",
      )
    }
    return
  }

  const cleared = await conversationService.clearQuickReplyChallenge({
    workspaceId,
    conversationId: conversation.id,
    nodeId,
  })
  if (!cleared) {
    return
  }

  await routeQuickReplyTarget({
    conversation,
    contactInbox,
    flowVersion,
    useLatestFlowVersion,
    sourceNodeId: nodeId,
    section: retry,
  })
}

export async function runQuickReplyFollowUpResume(data: {
  smartDelayId: string
}): Promise<void> {
  const row = await smartDelayService.findById({ id: data.smartDelayId })
  if (
    !row ||
    row.type !== smartDelayTypes.enum.quickReplyFollowUp ||
    row.status !== smartDelayStatuses.enum.scheduled ||
    !row.nodeId
  ) {
    return
  }
  if (row.triggerAt.getTime() > Date.now()) {
    return
  }

  const { conversation, contactInbox } =
    await detectConversationAndContactInbox({
      conversationId: row.conversationId,
      contactInboxId: row.contactInboxId,
    })

  const [hasReplied, isActive] = await Promise.all([
    contactInboxService.hasIncomingMessageSince({
      workspaceId: row.workspaceId,
      contactInboxId: row.contactInboxId,
      since: row.createdAt,
    }),
    conversationService.ensureActive(conversation),
  ])

  if (hasReplied || !isActive) {
    const canceled = await smartDelayService.claimForRun({
      id: row.id,
      to: smartDelayStatuses.enum.canceled,
    })
    if (canceled) {
      logger.info(
        { smartDelayId: row.id, hasReplied, isActive },
        "Quick reply follow-up canceled: contact engaged or bot inactive",
      )
    }
    return
  }

  const completed = await smartDelayService.claimForRun({
    id: row.id,
    to: smartDelayStatuses.enum.completed,
  })
  if (!completed) {
    return
  }

  const { flowVersion, useLatestFlowVersion } = await detectFlowVersion({
    flowId: row.flowId,
    flowVersionId: row.flowVersionId ?? undefined,
    workspaceId: row.workspaceId,
  })
  const followUp = resolveActiveQuickReplySettings(
    findNodeDetails(flowVersion, row.nodeId),
  ).followUp
  if (!followUp) {
    logger.warn(
      { smartDelayId: row.id, nodeId: row.nodeId },
      "Quick reply follow-up skipped: follow-up no longer configured",
    )
    return
  }

  await conversationService.clearQuickReplyChallenge({
    workspaceId: row.workspaceId,
    conversationId: row.conversationId,
    nodeId: row.nodeId,
  })

  const metadata = metadataSchema.safeParse(row.metadata)
  await routeQuickReplyTarget({
    conversation,
    contactInbox,
    flowVersion,
    useLatestFlowVersion,
    sourceNodeId: row.nodeId,
    section: followUp,
    metadata: metadata.success ? metadata.data : undefined,
  })
}
```

Check the import paths against the real code before running:
- `contactInboxService`: `follow-up.ts` imports it from `@chatbotx.io/business/contact-inbox`. Use that path and keep the test's mock for that path.
- `ContactInboxModel` / `ConversationModel`: import them from wherever `challenge.ts` / `flow.ts` get them.
- `metadataSchema`: import it from the same place `smart-delay.ts` does.

- [ ] **Step 4: Branch runChallenge**

In `apps/worker/src/integration/handlers/challenge.ts`, replace:
```ts
  if (challenge.type !== "step") {
    return
  }
```
with (after `detectConversationAndContactInbox` so both types share the lookup — move that call above):
```ts
  const { conversation, contactInbox } =
    await detectConversationAndContactInbox({
      conversationId,
      contactInboxId,
    })

  if (challenge.type === "quickReply") {
    await runQuickReplyChallenge({ conversation, contactInbox, challenge })
    return
  }
```
Remove the now-duplicate `detectConversationAndContactInbox` call below it. Import `runQuickReplyChallenge` from `./quick-reply-resume`.

Add to `apps/worker/__tests__/challenge-handler.test.ts`:
```ts
// with the other vi.mock calls:
const runQuickReplyChallenge = vi.fn(async () => undefined)
vi.mock("../src/integration/handlers/quick-reply-resume", () => ({
  runQuickReplyChallenge: (...args: unknown[]) => runQuickReplyChallenge(...(args as [never])),
}))

// new test:
test("delegates a quickReply challenge and does not re-run the node", async () => {
  mocks.detectConversationAndContactInbox.mockResolvedValue({
    conversation: { id: "conversation-1", workspaceId: "workspace-1" },
    contactInbox: { id: "contact-inbox-1" },
  })
  await runChallenge({
    conversationId: "conversation-1",
    contactInboxId: "contact-inbox-1",
    challenge: {
      type: "quickReply",
      data: { flowId: "flow-1", nodeId: "node-1", attempts: 0, maxRetries: 3, sentAt: new Date() },
    },
  })
  expect(runQuickReplyChallenge).toHaveBeenCalledOnce()
  expect(mocks.runStepsAndQuickReplies).not.toHaveBeenCalled()
})
```

- [ ] **Step 5: Dispatch the new job**

In `apps/worker/src/integration/worker.ts`, after the `resumeFollowUp` case:
```ts
            case IntegrationJobAction.resumeQuickReplyFollowUp: {
              await runQuickReplyFollowUpResume(job.data.data)
              return
            }
```
Import `runQuickReplyFollowUpResume` from `./handlers/quick-reply-resume`. Then:
Run: `grep -rn "resumeFollowUp" apps/worker/src | grep -v "handlers/follow-up.ts"`
For every list that names `resumeFollowUp` (e.g. `channel-origin.ts`, any job-name allowlist), add `resumeQuickReplyFollowUp` next to it.

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm --filter worker exec vitest run __tests__/quick-reply-resume.test.ts __tests__/challenge-handler.test.ts __tests__/resume-follow-up.test.ts __tests__/scan-smart-delay.test.ts`
Expected: PASS.

Run: `pnpm --filter worker check-types && pnpm check:circular`
Expected: PASS; no cycle through `quick-reply-resume.ts` (it imports `flow.ts`; nothing `flow.ts` imports may import it).

- [ ] **Step 7: Commit**

```bash
git add apps/worker/src/integration/handlers/quick-reply-resume.ts apps/worker/src/integration/handlers/challenge.ts apps/worker/src/integration/worker.ts apps/worker/__tests__/quick-reply-resume.test.ts apps/worker/__tests__/challenge-handler.test.ts
git commit -m "feat(worker): quick reply retry loop and follow-up resume"
```
(Add any file edited in Step 5's grep.)

---

### Task 7: cancellation hooks — webchat tap and AI/automation handoff

**Files:**
- Create: `apps/builder/src/features/messages/lib/should-run-webchat-challenge.ts`
- Modify: `apps/builder/src/features/messages/actions/create-webchat-message.action.ts:327-345`
- Modify: `apps/worker/src/trigger/services/handoff-executor.service.ts:36-50`
- Test: `apps/builder/__tests__/should-run-webchat-challenge.test.ts`

**Interfaces:**
- Produces: `shouldRunWebchatChallenge(challenge: ConversationAttributes["challenge"], hasPostback: boolean): boolean`

- [ ] **Step 1: Write the failing test**

Create `apps/builder/__tests__/should-run-webchat-challenge.test.ts`:

```ts
import { describe, expect, test } from "vitest"
import { shouldRunWebchatChallenge } from "@/features/messages/lib/should-run-webchat-challenge"

const quickReplyChallenge = {
  type: "quickReply" as const,
  data: { flowId: "f", nodeId: "n", attempts: 0, maxRetries: 3, sentAt: new Date() },
}
const stepChallenge = {
  type: "step" as const,
  data: { flowId: "f", nodeId: "n", stepId: "s", attempts: 0, lastAttemptAt: new Date() },
}

describe("shouldRunWebchatChallenge", () => {
  test("no challenge → false", () => {
    expect(shouldRunWebchatChallenge(undefined, false)).toBe(false)
  })
  test("free text with a quick reply retry pending → true", () => {
    expect(shouldRunWebchatChallenge(quickReplyChallenge, false)).toBe(true)
  })
  test("a quick reply tap never counts as a non quick reply answer", () => {
    expect(shouldRunWebchatChallenge(quickReplyChallenge, true)).toBe(false)
  })
  test("Get User Data keeps its existing behaviour for postbacks", () => {
    expect(shouldRunWebchatChallenge(stepChallenge, true)).toBe(true)
  })
})
```
(If the builder vitest config doesn't resolve `@/`, use the relative path `../src/features/messages/lib/should-run-webchat-challenge`.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter builder exec vitest run __tests__/should-run-webchat-challenge.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement + wire**

Create `apps/builder/src/features/messages/lib/should-run-webchat-challenge.ts`:
```ts
import type { ConversationAttributes } from "@chatbotx.io/database/partials"

/**
 * Webchat taps arrive as a postback on the same message, so unlike the
 * webhook channels they are not excluded from challenge routing upstream.
 * A tap must never count as a "reply that isn't a quick reply".
 */
export function shouldRunWebchatChallenge(
  challenge: ConversationAttributes["challenge"],
  hasPostback: boolean,
): boolean {
  if (!challenge) {
    return false
  }
  return !(challenge.type === "quickReply" && hasPostback)
}
```

In `create-webchat-message.action.ts`, replace `if (additionalAttributes?.challenge) {` with:
```ts
    const hasPostback = Boolean(
      "postback" in parsedInput && parsedInput.postback,
    )
    if (shouldRunWebchatChallenge(additionalAttributes?.challenge, hasPostback)) {
```
and keep the `else if (newMessage.text && !(...postback...))` branch as is (a tap with a quick-reply challenge falls through to it and is skipped there because of the postback; the postback flow action — enqueued earlier in this action — clears the challenge in `runFlowAction`). Import the helper.

- [ ] **Step 4: Handoff executor**

In `apps/worker/src/trigger/services/handoff-executor.service.ts`, extend the existing atomic `.set({...})` (legacy direct-`db` write, extended in place):
```ts
        .set({
          botEnabled: false,
          botResumeAt: new Date(Date.now() + BOT_DISABLE_DURATION_MS),
          additionalAttributes: sql`CASE WHEN ${conversationModel.additionalAttributes}->'challenge'->>'type' = 'quickReply' THEN ${conversationModel.additionalAttributes} - 'challenge' ELSE ${conversationModel.additionalAttributes} END`,
        })
```
and after `if (updated.length === 0) { return }`:
```ts
      await smartDelayService.cancelQuickReplyFollowUps({
        workspaceId,
        conversationIds: [conversationId],
      })
```
Imports: `sql` from `drizzle-orm` (merge with the existing `and, eq` import), `smartDelayService` from `@chatbotx.io/business/smart-delay`.

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter builder exec vitest run __tests__/should-run-webchat-challenge.test.ts && pnpm --filter builder check-types && pnpm --filter worker check-types`
Expected: PASS.

Run: `pnpm --filter worker exec vitest run __tests__ -t "handoff"`
Expected: PASS. If a handoff-executor test asserts the exact `.set()` payload, update it to include `additionalAttributes: expect.anything()` and to mock `@chatbotx.io/business/smart-delay`.

- [ ] **Step 6: Commit**

```bash
git add apps/builder/src/features/messages/lib/should-run-webchat-challenge.ts apps/builder/src/features/messages/actions/create-webchat-message.action.ts apps/builder/__tests__/should-run-webchat-challenge.test.ts apps/worker/src/trigger/services/handoff-executor.service.ts
git commit -m "fix(flows): quick reply taps and handoff end a pending retry"
```

---

### Task 8: builder — extract the button-target chooser

**Files:**
- Create: `apps/builder/src/features/flows/react-flow/hooks/use-button-target.ts`
- Modify: `apps/builder/src/features/flows/react-flow/button-editor-dialog.tsx:75-151` (export components, `beforeStepName` prop), `:223-250` and `:379-484` (use hook)

**Interfaces:**
- Produces:
  - `useHandleEdges(): { refreshEdge(handleId: string, sourceNodeId: string, targetNodeId: string): void; removeEdge(handleId: string): void }`
  - `type ButtonTargetBeforeStep = StartAnotherNodeStepSchema | OpenWebsiteStepSchema | StartExternalFlowStepSchema | StartExternalNodeStepSchema`
  - `useCreateButtonTarget(): (buttonType: ButtonType) => { beforeStep: ButtonTargetBeforeStep; newNode: FlowNode | null } | null` (adds the new node to the canvas itself)
  - `export function AllButtonOptions(props: { onChooseButton: (t: ButtonType | null) => void; hiddenButtonTypes?: ButtonType[] })`
  - `export function ActiveButton(props: { buttonType: ButtonType; onChooseButton: (t: ButtonType | null) => void; beforeStepName?: string })` (default `"beforeStep"`)

This is a behaviour-preserving refactor; the existing button editor is the regression test.

- [ ] **Step 1: Create the hook file**

Create `apps/builder/src/features/flows/react-flow/hooks/use-button-target.ts` by **moving** (not copying) the logic out of `button-editor-dialog.tsx`:

```ts
"use client"

import {
  type ButtonType,
  buttonTypes,
  type FlowNode,
  nodeTypeSchema,
  type OpenWebsiteStepSchema,
  openWebsiteStepDefaultFn,
  performActionNodeDefaultFn,
  type StartAnotherNodeStepSchema,
  type StartExternalFlowStepSchema,
  type StartExternalNodeStepSchema,
  sendMessageNodeDefaultFn,
  startAnotherNodeStepDefaultFn,
  startExternalFlowStepDefaultFn,
  startExternalNodeStepDefaultFn,
} from "@chatbotx.io/flow-config"
import { useReactFlow } from "@xyflow/react"
import { useTranslations } from "next-intl"
import { useCallback } from "react"

export type ButtonTargetBeforeStep =
  | StartAnotherNodeStepSchema
  | OpenWebsiteStepSchema
  | StartExternalFlowStepSchema
  | StartExternalNodeStepSchema

export function useHandleEdges() {
  const { setEdges } = useReactFlow()

  const refreshEdge = useCallback(
    (handleId: string, sourceNodeId: string, targetNodeId: string) => {
      setEdges((currentEdges) => [
        ...currentEdges.filter((edge) => edge.sourceHandle !== handleId),
        {
          id: handleId,
          source: sourceNodeId,
          target: targetNodeId,
          sourceHandle: handleId,
          targetHandle: targetNodeId,
          type: "buttonedge",
        },
      ])
    },
    [setEdges],
  )

  const removeEdge = useCallback(
    (handleId: string) => {
      setEdges((currentEdges) =>
        currentEdges.filter((edge) => edge.sourceHandle !== handleId),
      )
    },
    [setEdges],
  )

  return { refreshEdge, removeEdge }
}

/**
 * Builds the beforeStep for a chosen button type; for Send Message and
 * Perform Action it also creates and adds the new node.
 */
export function useCreateButtonTarget() {
  const t = useTranslations()
  const { getNodes, addNodes, screenToFlowPosition } = useReactFlow()

  return useCallback(
    (
      buttonType: ButtonType,
    ): { beforeStep: ButtonTargetBeforeStep; newNode: FlowNode | null } | null => {
      const allNodes = getNodes() as FlowNode[]
      const position = screenToFlowPosition({
        x: window.innerWidth - 400,
        y: 100,
      })

      let newNode: FlowNode | null = null
      let beforeStep: ButtonTargetBeforeStep | null = null

      switch (buttonType) {
        case buttonTypes.enum.sendMessage: {
          const nodeCount = allNodes.filter(
            (node) => node.type === nodeTypeSchema.enum.sendMessage,
          ).length
          newNode = sendMessageNodeDefaultFn({
            nodeProps: { position },
            dataProps: { name: `${t("actions.sendMessage")} #${nodeCount + 1}` },
          })
          beforeStep = startAnotherNodeStepDefaultFn({
            nodeId: newNode.id,
            viewOnly: true,
          })
          break
        }
        case buttonTypes.enum.performAction: {
          const nodeCount = allNodes.filter(
            (node) => node.type === nodeTypeSchema.enum.performAction,
          ).length
          newNode = performActionNodeDefaultFn({
            nodeProps: { position },
            dataProps: {
              name: `${t("flows.actions.performAction")} #${nodeCount + 1}`,
            },
          })
          beforeStep = startAnotherNodeStepDefaultFn({
            nodeId: newNode.id,
            viewOnly: true,
          })
          break
        }
        case buttonTypes.enum.startExternalFlow:
          beforeStep = startExternalFlowStepDefaultFn()
          break
        case buttonTypes.enum.openWebsite:
          beforeStep = openWebsiteStepDefaultFn()
          break
        case buttonTypes.enum.startExternalNode:
          beforeStep = startExternalNodeStepDefaultFn()
          break
        case buttonTypes.enum.startAnotherNode:
          beforeStep = startAnotherNodeStepDefaultFn()
          break
        default:
          return null
      }

      if (newNode) {
        addNodes([newNode])
      }
      return { beforeStep, newNode }
    },
    [addNodes, getNodes, screenToFlowPosition, t],
  )
}
```

- [ ] **Step 2: Refactor ButtonEditorDialog to use it**

In `button-editor-dialog.tsx`:
- `export` `AllButtonOptions` and `ActiveButton`.
- Give `ActiveButton` a `beforeStepName = "beforeStep"` prop and use it in both places that currently hard-code `"beforeStep"`:
```tsx
  const beforeStep = getValues(beforeStepName)
  …
      {beforeStep && (
        <DynamicStepEditor parentName={beforeStepName} type={beforeStep.stepType} />
      )}
```
- Replace the local `refreshEdge`/`removeEdge` with `const { refreshEdge, removeEdge } = useHandleEdges()`.
- Replace the body of `onChooseButton` with:
```ts
    (selectedButtonType: ButtonType | null) => {
      setValue("buttonType", selectedButtonType)
      setValue("steps", [])
      setValue("beforeStep", null)
      if (!selectedButtonType) {
        return
      }

      const created = createButtonTarget(selectedButtonType)
      if (!created) {
        return
      }

      setValue("beforeStep", created.beforeStep)

      if (created.newNode) {
        const currentButtonId = getValues("id") as string
        if (currentButtonId && activeNode) {
          refreshEdge(currentButtonId, activeNode.id, created.newNode.id)
        }
        onSave()
      }
    },
```
with `const createButtonTarget = useCreateButtonTarget()` and the dependency list updated (`activeNode, createButtonTarget, getValues, onSave, refreshEdge, setValue`).
- Remove now-unused imports (`nodeTypeSchema`, the `*DefaultFn` node/step factories, `StartAnotherNodeStepSchema` etc.). `pnpm fix` will flag leftovers.

The original `default: return` ran before `setValue("beforeStep", …)`, and the `null` case also reached that `default`. The rewrite keeps that behaviour: `null` returns right after clearing.

- [ ] **Step 3: Verify the refactor**

Run: `pnpm --filter builder check-types && pnpm --filter builder exec vitest run src/features/flows`
Expected: PASS.

Then check it by hand in the running builder (`pnpm --filter builder dev`). On a Send Message node, open a button:
- Choose **Send Message**. A new node appears, joined by an edge.
- Clear the choice with ✕, then choose **Open Website**. The URL field shows, and on Confirm the edge is gone.

- [ ] **Step 4: Commit**

```bash
git add apps/builder/src/features/flows/react-flow/hooks/use-button-target.ts apps/builder/src/features/flows/react-flow/button-editor-dialog.tsx
git commit -m "refactor(flows): share the button target chooser"
```

---

### Task 9: builder — settings dialog, next-step picker, i18n

**Files:**
- Create: `apps/builder/src/features/flows/react-flow/nodes/quick-reply-settings/next-step-picker.tsx`
- Create: `apps/builder/src/features/flows/react-flow/nodes/quick-reply-settings/quick-reply-settings-dialog.tsx`
- Modify: `apps/builder/src/features/flows/react-flow/nodes/editor.tsx:101-155` (`NodeEditorQuickReplies` gets `nodeId`, icon), `:512-526` (pass `nodeId`, error collection)
- Modify: `apps/builder/messages/*.json` (21 files)

**Interfaces:**
- Consumes: Task 1 exports; Task 8 `useHandleEdges`, `useCreateButtonTarget`, `AllButtonOptions`, `ActiveButton`
- Produces:
  - `NextStepPicker(props: { nodeId: string; sectionName: "quickReplySettings.followUp" | "quickReplySettings.retry" })`
  - `QuickReplySettingsDialog(props: { nodeId: string })` (renders its own ⚙️ trigger)

- [ ] **Step 1: i18n keys**

In `apps/builder/messages/en.json`, add this block inside `"flows"` next to `"quickReplies"`:
```json
    "quickReplySettings": {
      "open": "Quick reply settings",
      "title": "Configure quick replies",
      "chooseNextStep": "Choose next step",
      "followUp": {
        "label": "Follow up if contact hasn’t engaged",
        "waitFor": "Wait for",
        "divider": "If contact hasn’t engaged, follow up with",
        "windowHint": "Messenger and Instagram only allow sending within 24 hours of the contact’s last message; later follow-ups are skipped there.",
        "handle": "No engagement"
      },
      "retry": {
        "label": "Retry if reply isn’t a Quick reply",
        "message": "Retry message",
        "messageDefault": "Please, tap one of the options below 👇",
        "count": "Number of retries",
        "countOption": "{count, plural, =0 {No retries} one {# time} other {# times}}",
        "divider": "When number of retries is exceeded",
        "handle": "Retries exceeded",
        "getUserDataConflict": "Retry isn’t available when this message contains a Get User Data step."
      }
    },
```
and inside the top-level `"messages"` object (next to `"flowConfigIncomplete"`, line ~3594):
```json
    "quickReplyNextStepRequired": "Choose a next step for each enabled quick reply setting",
    "quickReplyRetryMessageRequired": "Enter a retry message",
    "quickReplyRetryWithGetUserData": "Retry can’t be combined with a Get User Data step",
```
Add the same keys, translated, to the other 20 locale files (`ar, az, da, de, es, fi, fr, he, id, it, ja, nl, pt-BR, pt-PT, ro, sv, tr, vi, zh-CN, zh-TW`). Keep the ICU plural syntax intact, and keep `{count}`/`#` untranslated. Do not edit `en.d.json.ts` by hand; it is generated.

Run: `pnpm --filter builder check-types`
Expected: PASS. The keys resolve through the generated types (regenerate with the builder's i18n type script if the repo has one; it's listed in `apps/builder/package.json`).

- [ ] **Step 2: NextStepPicker**

Create `nodes/quick-reply-settings/next-step-picker.tsx`:

```tsx
"use client"

import {
  type ButtonType,
  quickReplyNextStepFollowsEdge,
  quickReplyNextStepHiddenButtonTypes,
  type QuickReplyNextStep,
} from "@chatbotx.io/flow-config"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { ChevronDownIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { ActiveButton, AllButtonOptions } from "../../button-editor-dialog"
import { useCreateButtonTarget, useHandleEdges } from "../../hooks/use-button-target"

type SectionName = "quickReplySettings.followUp" | "quickReplySettings.retry"

export function NextStepPicker({
  nodeId,
  sectionName,
}: {
  nodeId: string
  sectionName: SectionName
}) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const { setValue } = useFormContext()
  const handleId = useWatch({ name: `${sectionName}.id` }) as string
  const enabled = useWatch({ name: `${sectionName}.enabled` }) as boolean
  const target = useWatch({ name: `${sectionName}.target` }) as
    | QuickReplyNextStep
    | null
  const createButtonTarget = useCreateButtonTarget()
  const { refreshEdge, removeEdge } = useHandleEdges()

  // Live save: keep the canvas edge in step with the target, including when
  // the combobox retargets a startAnotherNode or the section is switched off.
  const targetNodeId =
    target && "nodeId" in target.beforeStep ? target.beforeStep.nodeId : null
  useEffect(() => {
    if (!handleId) {
      return
    }
    if (enabled && target && quickReplyNextStepFollowsEdge(target) && targetNodeId) {
      refreshEdge(handleId, nodeId, targetNodeId)
    } else if (!(enabled && target === null)) {
      // Keep a hand-drawn edge while the section is on and not configured yet.
      removeEdge(handleId)
    }
  }, [enabled, handleId, nodeId, refreshEdge, removeEdge, target, targetNodeId])

  const onChooseButton = useCallback(
    (buttonType: ButtonType | null) => {
      if (!buttonType) {
        setValue(`${sectionName}.target`, null, {
          shouldDirty: true,
          shouldValidate: true,
        })
        return
      }
      const created = createButtonTarget(buttonType)
      if (!created) {
        return
      }
      setValue(
        `${sectionName}.target`,
        { buttonType, beforeStep: created.beforeStep },
        { shouldDirty: true, shouldValidate: true },
      )
      setOpen(false)
    },
    [createButtonTarget, sectionName, setValue],
  )

  return (
    <>
      {target ? (
        <ActiveButton
          beforeStepName={`${sectionName}.target.beforeStep`}
          buttonType={target.buttonType}
          onChooseButton={onChooseButton}
        />
      ) : (
        <Button
          className="w-full rounded-full"
          onClick={() => setOpen(true)}
          type="button"
          variant="dashed"
        >
          {t("flows.quickReplySettings.chooseNextStep")}
          <ChevronDownIcon />
        </Button>
      )}

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("flows.quickReplySettings.chooseNextStep")}</DialogTitle>
            <DialogDescription />
          </DialogHeader>
          <AllButtonOptions
            hiddenButtonTypes={quickReplyNextStepHiddenButtonTypes}
            onChooseButton={onChooseButton}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
```
`ActiveButton` calls `getValues(beforeStepName)` once per render. That is enough here because the node form re-renders this component when `target` changes.

- [ ] **Step 3: Settings dialog**

Create `nodes/quick-reply-settings/quick-reply-settings-dialog.tsx`:

```tsx
"use client"

import {
  QUICK_REPLY_DEFAULT_RETRIES,
  QUICK_REPLY_MAX_RETRIES,
  QUICK_REPLY_RETRY_MESSAGE_MAX,
  quickReplySettingsDefaultFn,
  quickReplySettingsDelayUnits,
  stepTypes,
} from "@chatbotx.io/flow-config"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Settings2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useRef, useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"
import { NextStepPicker } from "./next-step-picker"

function Divider({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground text-sm">
      <div className="h-px flex-1 bg-border" />
      <span>{children}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

export function QuickReplySettingsDialog({ nodeId }: { nodeId: string }) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const { getValues, setValue } = useFormContext()

  const settings = useWatch({ name: "quickReplySettings" })
  const followUpEnabled = useWatch({ name: "quickReplySettings.followUp.enabled" })
  const retryEnabled = useWatch({ name: "quickReplySettings.retry.enabled" })
  const maxRetries = useWatch({ name: "quickReplySettings.retry.maxRetries" })
  const steps = useWatch({ name: "steps" }) as { stepType: string }[] | undefined
  const hasGetUserData = (steps ?? []).some(
    (step) => step.stepType === stepTypes.enum.getUserData,
  )

  // Nodes saved before this feature have no settings: backfill on first open.
  useEffect(() => {
    if (open && !getValues("quickReplySettings")) {
      setValue("quickReplySettings", quickReplySettingsDefaultFn(), {
        shouldDirty: true,
      })
    }
  }, [getValues, open, setValue])

  // Pre-fill the retry message the first time Retry is switched on.
  const prevRetryEnabled = useRef(retryEnabled)
  useEffect(() => {
    if (retryEnabled && !prevRetryEnabled.current) {
      const message = getValues("quickReplySettings.retry.message")
      if (!message) {
        setValue(
          "quickReplySettings.retry.message",
          t("flows.quickReplySettings.retry.messageDefault"),
          { shouldDirty: true, shouldValidate: true },
        )
      }
    }
    prevRetryEnabled.current = retryEnabled
  }, [getValues, retryEnabled, setValue, t])

  const unitOptions = useMemo(
    () =>
      quickReplySettingsDelayUnits.options.map((unit) => ({
        value: unit,
        label: t(`fields.delayUnit.${unit}`),
      })),
    [t],
  )
  const retryOptions = useMemo(
    () =>
      Array.from({ length: QUICK_REPLY_MAX_RETRIES + 1 }, (_, count) => ({
        value: String(count),
        label: t("flows.quickReplySettings.retry.countOption", { count }),
      })),
    [t],
  )

  return (
    <>
      <Button
        aria-label={t("flows.quickReplySettings.open")}
        onClick={() => setOpen(true)}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Settings2Icon />
      </Button>

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="max-h-screen max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("flows.quickReplySettings.title")}</DialogTitle>
            <DialogDescription />
          </DialogHeader>

          {settings && (
            <div className="flex flex-col gap-4">
              <section className="flex flex-col gap-3">
                <SwitchField
                  label={t("flows.quickReplySettings.followUp.label")}
                  name="quickReplySettings.followUp.enabled"
                />
                {followUpEnabled && (
                  <>
                    <div className="flex items-center gap-2">
                      <Label className="flex-1">
                        {t("flows.quickReplySettings.followUp.waitFor")}
                      </Label>
                      <InputNumberField
                        min={1}
                        name="quickReplySettings.followUp.duration"
                        required
                        stepper={1}
                      />
                      <SelectField
                        name="quickReplySettings.followUp.unit"
                        options={unitOptions}
                        required
                      />
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {t("flows.quickReplySettings.followUp.windowHint")}
                    </p>
                    <Divider>{t("flows.quickReplySettings.followUp.divider")}</Divider>
                    <NextStepPicker
                      nodeId={nodeId}
                      sectionName="quickReplySettings.followUp"
                    />
                  </>
                )}
              </section>

              <div className="h-px bg-border" />

              <section className="flex flex-col gap-3">
                <SwitchField
                  description={
                    hasGetUserData
                      ? t("flows.quickReplySettings.retry.getUserDataConflict")
                      : undefined
                  }
                  descriptionType="tooltip"
                  disabled={hasGetUserData}
                  label={t("flows.quickReplySettings.retry.label")}
                  name="quickReplySettings.retry.enabled"
                />
                {retryEnabled && !hasGetUserData && (
                  <>
                    {Number(maxRetries) > 0 && (
                      <TiptapEditorField
                        includeBotFieldVariables
                        label={t("flows.quickReplySettings.retry.message")}
                        maxLength={QUICK_REPLY_RETRY_MESSAGE_MAX}
                        name="quickReplySettings.retry.message"
                      />
                    )}
                    <SelectField
                      label={t("flows.quickReplySettings.retry.count")}
                      name="quickReplySettings.retry.maxRetries"
                      onValueChange={(value) =>
                        setValue(
                          "quickReplySettings.retry.maxRetries",
                          Number(value),
                          { shouldDirty: true, shouldValidate: true },
                        )
                      }
                      options={retryOptions}
                      value={String(maxRetries ?? QUICK_REPLY_DEFAULT_RETRIES)}
                    />
                    <Divider>{t("flows.quickReplySettings.retry.divider")}</Divider>
                    <NextStepPicker
                      nodeId={nodeId}
                      sectionName="quickReplySettings.retry"
                    />
                  </>
                )}
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
```
`SelectField` spreads `...rest` after its own `value`/`onValueChange` (`select-field.tsx:129-134`), so these props override its defaults. The form therefore stores a number, and the select shows it as a string.

- [ ] **Step 4: Mount in the node editor**

In `nodes/editor.tsx`:
- Change `const NodeEditorQuickReplies = () => {` to `const NodeEditorQuickReplies = ({ nodeId }: { nodeId: string }) => {`.
- After the add-button/limit block, still inside the wrapping `div`:
```tsx
      {quickReplies.length > 0 && <QuickReplySettingsDialog nodeId={nodeId} />}
```
- Render it as `<NodeEditorQuickReplies nodeId={nodeId} />` at line ~524.
- Extend the error collection just above it so settings errors show too:
```tsx
                const messages = collectErrorMessages([
                  // biome-ignore lint/suspicious/noExplicitAny: wip - dynamic form errors
                  (form.formState.errors as any).quickReplies,
                  // biome-ignore lint/suspicious/noExplicitAny: wip - dynamic form errors
                  (form.formState.errors as any).quickReplySettings,
                ])
```
- Import `QuickReplySettingsDialog` from `./quick-reply-settings/quick-reply-settings-dialog`.

A validation code like `quickReplyNextStepRequired` shows up in the node `ErrorAlert` as the raw code. Look at how existing codes such as `sendTextTooLongForChannel` are displayed there: `grep -rn "resolveFlowValidationMessageKey\|isFlowValidationCode" apps/builder/src/features/flows`. If the node alert already maps codes through `resolveFlowValidationMessageKey`, nothing more is needed. If not, map every message with `isFlowValidationCode(m) ? t(\`messages.${m}\`) : m` in this block only.

- [ ] **Step 5: Verify**

Run: `pnpm --filter builder check-types && pnpm lint`
Expected: PASS.

Check by hand in the builder:
- On a Send Message node, the ⚙️ icon appears only after the first quick reply is added.
- The toggles show and hide their fields.
- The retry message is pre-filled.
- Retries set to 0 hides the message field.
- Choosing Send Message creates a node and an edge.
- Clearing with ✕ removes the edge.
- A node that has a Get User Data step shows Retry disabled, with a tooltip.
- Reloading the page keeps every value.
- Publishing with a toggle on and no target shows the new toast text.

- [ ] **Step 6: Commit**

```bash
git add apps/builder/src/features/flows/react-flow/nodes/quick-reply-settings/next-step-picker.tsx apps/builder/src/features/flows/react-flow/nodes/quick-reply-settings/quick-reply-settings-dialog.tsx apps/builder/src/features/flows/react-flow/nodes/editor.tsx apps/builder/messages/*.json
git commit -m "feat(flows): configure quick replies dialog"
```
(List the 21 locale files explicitly instead of the glob if your shell hook rejects globs.)

---

### Task 10: builder — canvas handles, analytics viewer, duplication

**Files:**
- Create: `apps/builder/src/features/flows/react-flow/nodes/quick-reply-settings/quick-reply-settings-handles.tsx`
- Modify: `apps/builder/src/features/flows/react-flow/nodes/viewer.tsx:76-82`
- Modify: `apps/builder/src/features/flows/react-flow/nodes/analytics-viewer.tsx` (the matching quick-replies map)
- Modify: `apps/builder/src/features/flows/react-flow/toolbar/duplicate-node-data.ts:98-102`
- Test: `apps/builder/src/features/flows/react-flow/toolbar/__tests__/duplicate-node-data.test.ts`

**Interfaces:**
- Consumes: `listQuickReplySettingsHandles`, `quickReplyNextStepFollowsEdge`, `quickReplySettingsDefaultFn` (Task 1)
- Produces: `QuickReplySettingsHandles(props: { details: unknown })`

- [ ] **Step 1: Write the failing duplication test**

Append to `duplicate-node-data.test.ts` (add `quickReplySettingsDefaultFn`, `startExternalFlowStepDefaultFn` to its `@chatbotx.io/flow-config` import if missing):

```ts
describe("duplicateFlowNodeData — quick reply settings", () => {
  test("regenerates section ids and drops edge-routed targets", () => {
    const original = sendMessageNodeDefaultFn({
      nodeProps: { id: "1", position: { x: 0, y: 0 } },
    })
    original.data.details.steps = [sendTextStepDefaultFn({ id: "2", text: "Hi" })]
    original.data.details.quickReplies = [
      {
        id: "3",
        label: "Yes",
        buttonType: null,
        beforeStep: null,
        steps: [],
      },
    ]
    const settings = quickReplySettingsDefaultFn()
    settings.followUp = {
      ...settings.followUp,
      enabled: true,
      target: {
        buttonType: buttonTypes.enum.startAnotherNode,
        beforeStep: startAnotherNodeStepDefaultFn({ nodeId: "4", viewOnly: true }),
      },
    }
    settings.retry = {
      ...settings.retry,
      enabled: true,
      message: "Tap",
      target: {
        buttonType: buttonTypes.enum.startExternalFlow,
        beforeStep: startExternalFlowStepDefaultFn(),
      },
    }
    original.data.details.quickReplySettings = settings

    const copy = duplicateFlowNodeData(original.data)
    const copied = (copy.details as typeof original.data.details).quickReplySettings

    expect(copied?.followUp.id).not.toBe(settings.followUp.id)
    expect(copied?.retry.id).not.toBe(settings.retry.id)
    // The copy has no edges, so a node-jump target would point nowhere.
    expect(copied?.followUp).toMatchObject({ enabled: false, target: null })
    // External targets don't depend on edges and are kept.
    expect(copied?.retry).toMatchObject({
      enabled: true,
      target: { buttonType: buttonTypes.enum.startExternalFlow },
    })
  })
})
```
(Match the call signature of `duplicateFlowNodeData` used by the neighbouring tests in the file. If they pass the whole node, pass `original` and read `copy.data.details`.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter builder exec vitest run src/features/flows/react-flow/toolbar/__tests__/duplicate-node-data.test.ts`
Expected: FAIL. The ids are unchanged or the targets are kept.

- [ ] **Step 3: Implement duplication**

In `toolbar/duplicate-node-data.ts`, after the `quickReplies` block (line ~98-102), add:
```ts
  if (
    "quickReplySettings" in details &&
    details.quickReplySettings &&
    isRecord(details.quickReplySettings)
  ) {
    const settings = details.quickReplySettings
    const copySection = <S extends { id: string; enabled: boolean; target: QuickReplyNextStep | null }>(
      section: S,
    ): S =>
      quickReplyNextStepFollowsEdge(section.target)
        ? { ...clone(section), id: createId(), enabled: false, target: null }
        : { ...clone(section), id: createId() }
    details.quickReplySettings = {
      followUp: copySection(settings.followUp),
      retry: copySection(settings.retry),
    }
  }
```
Import `quickReplyNextStepFollowsEdge` and `type QuickReplyNextStep` from `@chatbotx.io/flow-config`. `isRecord`, `clone` and `createId` are already used in this file. Reuse them.

- [ ] **Step 4: Canvas handles**

Create `nodes/quick-reply-settings/quick-reply-settings-handles.tsx`:
```tsx
"use client"

import { listQuickReplySettingsHandles } from "@chatbotx.io/flow-config"
import { Position } from "@xyflow/react"
import { useTranslations } from "next-intl"
import { BaseHandle } from "@/components/base-handle"

export function QuickReplySettingsHandles({ details }: { details: unknown }) {
  const t = useTranslations()
  const handles = listQuickReplySettingsHandles(details)
  if (handles.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-1">
      {handles.map((handle) => (
        <div
          className="relative w-full rounded border border-dashed px-3 py-1 text-right text-muted-foreground text-xs"
          key={handle.id}
        >
          {t(`flows.quickReplySettings.${handle.kind}.handle`)}
          {/* React Flow routes from physical Position.Right. */}
          <BaseHandle
            className="right-3!"
            id={handle.id}
            position={Position.Right}
            type="source"
          />
        </div>
      ))}
    </div>
  )
}
```

In `nodes/viewer.tsx`, directly after the `quickReplies.map(...)` block (line ~81), add:
```tsx
          {"quickReplySettings" in data.details && (
            <QuickReplySettingsHandles details={data.details} />
          )}
```
Do the same in `nodes/analytics-viewer.tsx`, right after its quick-replies `ButtonStepViewer` map. Import the component in both files.

- [ ] **Step 5: Run tests + verify**

Run: `pnpm --filter builder exec vitest run src/features/flows/react-flow/toolbar/__tests__/duplicate-node-data.test.ts && pnpm --filter builder check-types`
Expected: PASS.

Check by hand in the builder:
- Turn on Follow-up. A "No engagement" handle appears under the quick replies.
- Drag it to a node. In the dialog, the picker now shows *Start Another Node* targeting that node.
- Delete the edge. The picker goes back to "Choose next step" and the handle stays.
- Pick *Start External Flow*. The handle disappears.
- Duplicate the node. The copy's Follow-up is off and has no target.

- [ ] **Step 6: Commit**

```bash
git add apps/builder/src/features/flows/react-flow/nodes/quick-reply-settings/quick-reply-settings-handles.tsx apps/builder/src/features/flows/react-flow/nodes/viewer.tsx apps/builder/src/features/flows/react-flow/nodes/analytics-viewer.tsx apps/builder/src/features/flows/react-flow/toolbar/duplicate-node-data.ts apps/builder/src/features/flows/react-flow/toolbar/__tests__/duplicate-node-data.test.ts
git commit -m "feat(flows): quick reply settings handles on the canvas"
```

---

### Task 11: Full verification

- [ ] **Step 1: Auto-fix + lint**

Run: `pnpm fix && pnpm lint`
Expected: PASS. `pnpm lint` includes `db:check-drift` and `check:agent-instructions`.

- [ ] **Step 2: Typecheck all touched workspaces**

Run: `pnpm --filter @chatbotx.io/flow-config check-types && pnpm --filter @chatbotx.io/database check-types && pnpm --filter @chatbotx.io/worker-config check-types && pnpm --filter @chatbotx.io/business check-types && pnpm --filter worker check-types && pnpm --filter builder check-types`
Expected: PASS.

- [ ] **Step 3: Tests**

Run: `pnpm --filter @chatbotx.io/flow-config test && pnpm --filter worker test && pnpm --filter builder test && pnpm --filter @chatbotx.io/business test`
Expected: PASS.

- [ ] **Step 4: Structural checks**

Run: `pnpm check:circular`
Expected: no new cycles.

Dispatch the `invariant-guard` agent on the branch diff. It checks i18n, the no-`db`-in-app rule, the no-dynamic-import rule and the `err` logging key.

- [ ] **Step 5: End-to-end smoke (local; the user applies migrations)**

Ask the user to run `pnpm --filter @chatbotx.io/database db:migrate`, after they have seen the two migration SQL files. Then, on a local Messenger or webchat test contact, set up a node with 2 quick replies, Retry at 2 retries leading to node B, and Follow-up after 1 minute leading to node C. Check each of these:
1. Type "hello". The retry message comes back with the quick replies.
2. Type again. A second retry is sent.
3. Type a third time. The contact lands on node B.
4. Re-send the node, then tap a quick reply. The tapped reply's route runs and no retry follows.
5. Re-send the node and wait 1 minute without replying. The contact lands on node C.
6. Re-send the node, reply with anything, and wait 1 minute. Nothing happens.
7. Re-send the node, then disable the bot (handoff) and type something. No retry is sent.
