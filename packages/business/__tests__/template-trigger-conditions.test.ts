// @vitest-environment node
import { describe, expect, test } from "vitest"
import {
  canonicalConditionRows,
  collectTriggerConditionReferences,
  countRowsWithUnshippedReferences,
  remapTriggerConditions,
  type TriggerConditionRow,
} from "../src/template/trigger-conditions"

const row = (
  type: string,
  sourceId: string | null,
  value: unknown = null,
): TriggerConditionRow => ({ type, sourceId, operator: null, value })

describe("collectTriggerConditionReferences", () => {
  test("reads the resource a row names by its event type", () => {
    const byKind = collectTriggerConditionReferences([
      row("tagApplied", "11"),
      row("customFieldValueChanged", "12"),
      row("dateTimeBasedTrigger", "13"),
      row("subscribedToSequence", "14"),
      row("productOrdered", "15"),
      row("categoryAddedToCart", "16"),
      row("pipelineItemCreated", "17"),
    ])
    expect(
      Object.fromEntries([...byKind].map(([k, v]) => [k, [...v]])),
    ).toEqual({
      tag: ["11"],
      customField: ["12", "13"],
      sequence: ["14"],
      product: ["15"],
      productCategory: ["16"],
      pipeline: ["17"],
    })
  })

  test("a moved-to-stage row also names its destination stage", () => {
    const byKind = collectTriggerConditionReferences([
      row("pipelineItemMovedToStage", "17", { stageId: "18" }),
    ])
    expect([...(byKind.get("pipelineStage") ?? [])]).toEqual(["18"])
  })

  test("ignores unpinned rows, non-numeric ids and types without a resource", () => {
    const byKind = collectTriggerConditionReferences([
      row("pipelineItemCreated", null),
      row("productOrdered", ""),
      row("contactInfoUpdated", "phone"),
      row("newOrder", "123"),
      row("tagApplied", "not-an-id"),
    ])
    expect(byKind.size).toBe(0)
  })
})

describe("remapTriggerConditions", () => {
  const idMaps = {
    tag: new Map([["11", "211"]]),
    pipeline: new Map([["17", "217"]]),
    pipelineStage: new Map([["18", "218"]]),
  }

  test("points rows at this workspace's copies, stage included", () => {
    const { conditions, dropped } = remapTriggerConditions(
      [
        row("tagApplied", "11"),
        row("pipelineItemMovedToStage", "17", { stageId: "18", keep: true }),
        row("newOrder", null),
      ],
      idMaps,
    )
    expect(dropped).toEqual([])
    expect(conditions).toEqual([
      row("tagApplied", "211"),
      row("pipelineItemMovedToStage", "217", { stageId: "218", keep: true }),
      row("newOrder", null),
    ])
  })

  test("drops a row whose reference did not make it across, never widening it", () => {
    const { conditions, dropped } = remapTriggerConditions(
      [row("tagApplied", "11"), row("productOrdered", "99")],
      idMaps,
    )
    expect(conditions).toEqual([row("tagApplied", "211")])
    expect(dropped).toEqual([{ index: 1, kind: "product", id: "99" }])
  })

  test("a value that cannot be a real id in a resource slot is dropped, not kept", () => {
    const { conditions, dropped } = remapTriggerConditions(
      [row("tagApplied", "not-an-id")],
      idMaps,
    )
    expect(conditions).toEqual([])
    expect(dropped).toEqual([{ index: 0, kind: "tag", id: "not-an-id" }])
  })

  test("drops a moved-to-stage row whose stage is unknown even when its pipeline maps", () => {
    const { conditions, dropped } = remapTriggerConditions(
      [row("pipelineItemMovedToStage", "17", { stageId: "77" })],
      idMaps,
    )
    expect(conditions).toEqual([])
    expect(dropped).toEqual([{ index: 0, kind: "pipelineStage", id: "77" }])
  })
})

describe("canonicalConditionRows", () => {
  test("is independent of row order and fills missing columns with null", () => {
    const a = canonicalConditionRows([
      { type: "b", sourceId: null, operator: null, value: undefined },
      row("a", "1"),
    ])
    const b = canonicalConditionRows([row("a", "1"), row("b", null)])
    expect(a).toEqual(b)
  })
})

describe("countRowsWithUnshippedReferences", () => {
  const empty = () => new Set<string>()
  const shipped = {
    sequence: empty(),
    product: empty(),
    productCategory: empty(),
    pipeline: new Set(["17"]),
    pipelineStage: empty(),
  }

  test("counts rows naming something the template does not carry", () => {
    expect(
      countRowsWithUnshippedReferences(
        [
          row("tagApplied", "12"),
          row("productOrdered", "15"),
          row("pipelineItemMovedToStage", "17", { stageId: "18" }),
          row("newOrder", null),
        ],
        shipped,
      ),
    ).toBe(2)
  })

  test("a kind left out of `shipped` is not checked", () => {
    expect(
      countRowsWithUnshippedReferences([row("tagApplied", "12")], {}),
    ).toBe(0)
  })
})
