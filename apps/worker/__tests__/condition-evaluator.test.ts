import { triggerEventTypes } from "@chatbotx.io/database/partials"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { describe, expect, test, vi } from "vitest"
import type { ConditionEvaluationContext } from "../src/trigger/types"

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      contactCustomFieldModel: { findFirst: vi.fn() },
      customFieldModel: { findFirst: vi.fn() },
    },
  },
}))

import { ConditionEvaluator } from "../src/trigger/services/condition-evaluator"

const workspace = { timezone: "UTC" } as WorkspaceModel

const buildContext = (
  condition: Partial<ConditionEvaluationContext["condition"]>,
  metadata: Record<string, unknown>,
): ConditionEvaluationContext =>
  ({
    condition: {
      sourceId: null,
      operator: null,
      value: null,
      ...condition,
    },
    eventData: {
      workspaceId: "ws-1",
      contactId: "contact-1",
      eventType: condition.type,
      eventData: metadata,
      timestamp: new Date(),
    },
    workspaceId: "ws-1",
    contactId: "contact-1",
    workspace,
  }) as ConditionEvaluationContext

describe("ConditionEvaluator contactInfoUpdated", () => {
  const evaluator = new ConditionEvaluator()

  test("matches when the updated info type equals the condition sourceId", async () => {
    await expect(
      evaluator.evaluate(
        buildContext(
          {
            type: triggerEventTypes.enum.contactInfoUpdated,
            sourceId: "phone",
          },
          { infoType: "phone", newValue: "+84912345678" },
        ),
      ),
    ).resolves.toBe(true)
  })

  test("does not match a different info type", async () => {
    await expect(
      evaluator.evaluate(
        buildContext(
          {
            type: triggerEventTypes.enum.contactInfoUpdated,
            sourceId: "email",
          },
          { infoType: "phone", newValue: "+84912345678" },
        ),
      ),
    ).resolves.toBe(false)
  })

  test("does not match when the condition has no sourceId", async () => {
    await expect(
      evaluator.evaluate(
        buildContext(
          { type: triggerEventTypes.enum.contactInfoUpdated, sourceId: null },
          { infoType: "phone", newValue: "+84912345678" },
        ),
      ),
    ).resolves.toBe(false)
  })

  test("still matches tag conditions through the shared source-id check", async () => {
    await expect(
      evaluator.evaluate(
        buildContext(
          { type: triggerEventTypes.enum.tagApplied, sourceId: "tag-1" },
          { tagId: "tag-1" },
        ),
      ),
    ).resolves.toBe(true)
  })
})
