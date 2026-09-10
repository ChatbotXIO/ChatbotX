import { describe, expect, test } from "vitest"
import {
  buildTargetFlowOptions,
  findFlowStartTemplateId,
} from "../broadcast-flow-targets"

const STEP_TYPE = "sendWaTemplateMessage"

const flow = (
  id: string,
  templateId: string | null,
  name = `Flow ${id}`,
  extra: { isLatest?: boolean; steps?: unknown[] } = {},
) => ({
  id,
  name,
  flowVersions: [
    {
      isLatest: extra.isLatest ?? true,
      nodes: [
        {
          data: {
            isStartNode: true,
            details: {
              steps: extra.steps ?? [
                { stepType: "sendText" },
                ...(templateId
                  ? [{ stepType: STEP_TYPE, template: { id: templateId } }]
                  : []),
              ],
            },
          },
        },
        {
          data: {
            isStartNode: false,
            details: {
              steps: [{ stepType: STEP_TYPE, template: { id: "not-start" } }],
            },
          },
        },
      ],
    },
  ],
})

const summary = (id: string, inboxId: string, structureKey = "S1") => ({
  id,
  inboxId,
  name: "promo",
  language: "vi",
  status: "APPROVED",
  structureKey,
})

describe("findFlowStartTemplateId", () => {
  test("reads the template id of the start node's template step from the published version", () => {
    expect(findFlowStartTemplateId(flow("f", "tpl-a"), STEP_TYPE)).toBe("tpl-a")
  })

  test("accepts the legacy WhatsApp step alias", () => {
    const legacy = flow("f", null, "Legacy", {
      steps: [{ stepType: "WA_TM01", template: { id: "tpl-legacy" } }],
    })
    expect(findFlowStartTemplateId(legacy, STEP_TYPE)).toBe("tpl-legacy")
  })

  test("ignores a draft-only version so a non-published flow ties to no page", () => {
    // The list query returns both the draft and the published version; a flow
    // with only a draft version must not be offered — the server validates the
    // published (isLatest) version and would reject it.
    const draftOnly = flow("f", "tpl-a", "Flow f", { isLatest: false })
    expect(findFlowStartTemplateId(draftOnly, STEP_TYPE)).toBeUndefined()
  })

  test("returns undefined when the start node has no template step or the nodes are malformed", () => {
    expect(findFlowStartTemplateId(flow("f", null), STEP_TYPE)).toBeUndefined()
    expect(
      findFlowStartTemplateId(
        {
          id: "f",
          name: "f",
          flowVersions: [{ isLatest: true, nodes: "bad" }],
        },
        STEP_TYPE,
      ),
    ).toBeUndefined()
    expect(
      findFlowStartTemplateId(
        { id: "f", name: "f", flowVersions: [] },
        STEP_TYPE,
      ),
    ).toBeUndefined()
  })
})

describe("buildTargetFlowOptions", () => {
  const templatesById = new Map([
    ["tpl-a", summary("tpl-a", "inbox-a")],
    ["tpl-b", summary("tpl-b", "inbox-b")],
    ["tpl-b2", summary("tpl-b2", "inbox-b")],
    ["tpl-c", summary("tpl-c", "inbox-c", "S2")],
  ])
  const pageA = { inboxId: "inbox-a", inboxName: "A" }
  const pageB = { inboxId: "inbox-b", inboxName: "B" }

  test("offers only the flows whose start template belongs to that page", () => {
    const flows = [
      flow("fa", "tpl-a", "Promo A"),
      flow("fb1", "tpl-b", "Promo B1"),
      flow("fb2", "tpl-b2", "Promo B2"),
    ]

    expect(
      buildTargetFlowOptions({
        flows,
        page: pageA,
        templatesById,
        stepType: STEP_TYPE,
      }),
    ).toEqual([{ label: "Promo A", value: "fa" }])

    expect(
      buildTargetFlowOptions({
        flows,
        page: pageB,
        templatesById,
        stepType: STEP_TYPE,
      }),
    ).toEqual([
      { label: "Promo B1", value: "fb1" },
      { label: "Promo B2", value: "fb2" },
    ])
  })

  test("excludes a flow whose start template belongs to another page", () => {
    const flows = [flow("fc", "tpl-c", "Promo C")]

    expect(
      buildTargetFlowOptions({
        flows,
        page: pageA,
        templatesById,
        stepType: STEP_TYPE,
      }),
    ).toEqual([])
  })

  test("excludes a flow with no start template", () => {
    const flows = [flow("fx", null, "No Template")]

    expect(
      buildTargetFlowOptions({
        flows,
        page: pageA,
        templatesById,
        stepType: STEP_TYPE,
      }),
    ).toEqual([])
  })

  test("excludes a flow whose start template id is not found in the template map", () => {
    const flows = [flow("fy", "tpl-unknown", "Unknown Template")]

    expect(
      buildTargetFlowOptions({
        flows,
        page: pageA,
        templatesById,
        stepType: STEP_TYPE,
      }),
    ).toEqual([])
  })
})
