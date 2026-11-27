import { triggerEventTypes } from "@chatbotx.io/database/partials"
import { describe, expect, test, vi } from "vitest"

vi.mock("@chatbotx.io/business", () => ({
  contactCustomFieldService: { listWithDefinitions: vi.fn() },
  contactService: { findById: vi.fn() },
  tagService: { findNameByIdForWorkspace: vi.fn() },
}))

const { buildWebhookPayload } = await import(
  "../src/webhook/services/webhook-payload.builder"
)

const timestamp = new Date("2026-10-25T00:00:00.000Z")

const baseItem = {
  sourceId: "p-1",
  pipelineId: "p-1",
  pipelineName: "Sales",
  pipelineReferenceName: "sales",
  itemId: "i-1",
  itemNumber: 12,
  title: "Big deal",
  contactId: "c-1",
  stageId: "s-2",
  stageName: "Negotiation",
  status: "open",
  statusLabel: "Open",
  priority: "high",
  value: 1500,
  currency: "USD",
  dueDate: null,
  actorKind: "user",
  actorUserId: "u-1",
}

const build = (
  eventType: (typeof triggerEventTypes.enum)[keyof typeof triggerEventTypes.enum],
  extra: Record<string, unknown> = {},
) =>
  buildWebhookPayload({
    workspaceId: "ws-1",
    contactId: "c-1",
    eventType,
    eventData: { ...baseItem, contactInboxId: "ci-secret", ...extra },
    timestamp,
  } as never)

describe("pipeline item webhook payloads", () => {
  test.each([
    [triggerEventTypes.enum.pipelineItemCreated, "pipeline_item_created"],
    [
      triggerEventTypes.enum.pipelineItemMovedToStage,
      "pipeline_item_moved_to_stage",
    ],
    [
      triggerEventTypes.enum.pipelineItemValueChanged,
      "pipeline_item_value_changed",
    ],
    [
      triggerEventTypes.enum.pipelineItemStatusChanged,
      "pipeline_item_status_changed",
    ],
    [
      triggerEventTypes.enum.pipelineItemPriorityChanged,
      "pipeline_item_priority_changed",
    ],
  ])("%s is named %s and carries the item snapshot", async (type, name) => {
    const payload = await build(type)

    expect(payload).toMatchObject({
      event: name,
      contact_id: "c-1",
      pipeline_id: "p-1",
      pipeline_reference_name: "sales",
      item_id: "i-1",
      item_number: 12,
      stage_name: "Negotiation",
      status_label: "Open",
      value: 1500,
      currency: "USD",
      actor_kind: "user",
    })
  })

  test("never exposes the internal contact inbox id", async () => {
    const payload = await build(triggerEventTypes.enum.pipelineItemCreated)

    expect(JSON.stringify(payload)).not.toContain("ci-secret")
  })

  test("includes previous values only on the event that changed them", async () => {
    const created = await build(triggerEventTypes.enum.pipelineItemCreated)
    const moved = await build(triggerEventTypes.enum.pipelineItemMovedToStage, {
      fromStageId: "s-1",
      fromStageName: "Lead",
    })
    const valueChanged = await build(
      triggerEventTypes.enum.pipelineItemValueChanged,
      { previousValue: null },
    )

    expect(created).not.toHaveProperty("from_stage_id")
    expect(created).not.toHaveProperty("previous_value")
    expect(moved).toMatchObject({
      from_stage_id: "s-1",
      from_stage_name: "Lead",
    })
    expect(valueChanged).toMatchObject({ previous_value: null })
  })
})
