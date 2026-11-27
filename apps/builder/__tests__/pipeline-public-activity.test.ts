import { describe, expect, test } from "vitest"
import { toPublicActivity } from "../src/features/pipelines/lib/map-public"
import { publicPipelineActivityResource } from "../src/features/pipelines/schema/resource"

const activity = (patch: Record<string, unknown>) =>
  ({
    id: "1",
    workspaceId: "w",
    pipelineId: "p",
    itemId: "i",
    itemNumber: 1,
    itemTitle: "Deal",
    contactId: "c",
    kind: "dueDateChanged",
    actorKind: "user",
    actorUserId: "u",
    actorSourceId: null,
    fromStageId: null,
    toStageId: null,
    fromStatus: null,
    toStatus: null,
    fromValue: null,
    toValue: null,
    fromPriority: null,
    toPriority: null,
    fromDueDate: null,
    toDueDate: null,
    fromTitle: null,
    toTitle: null,
    fromPipelineId: null,
    version: 1,
    occurredAt: new Date("2026-05-01T00:00:00Z"),
    fromStageName: null,
    toStageName: null,
    fromPipelineName: null,
    pipelineName: "Sales",
    ...patch,
  }) as Parameters<typeof toPublicActivity>[0]

describe("toPublicActivity", () => {
  test("a due date change carries the previous and new date, null when cleared", () => {
    const set = toPublicActivity(
      activity({ toDueDate: new Date("2026-06-01T09:00:00Z") }),
    )
    const cleared = toPublicActivity(
      activity({ fromDueDate: new Date("2026-06-01T09:00:00Z") }),
    )

    expect(set).toMatchObject({
      fromDueDate: null,
      toDueDate: new Date("2026-06-01T09:00:00Z"),
    })
    expect(cleared).toMatchObject({
      fromDueDate: new Date("2026-06-01T09:00:00Z"),
      toDueDate: null,
    })
    expect(publicPipelineActivityResource.parse(cleared)).toMatchObject({
      toDueDate: null,
    })
  })
})
