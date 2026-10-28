import { describe, expect, test } from "vitest"
import {
  buildConditionDraft,
  buildDraftFromCondition,
  getConditionOptionsForConfig,
  getDefaultConditionValue,
} from "@/features/contact-filter/components/contact-filter-condition-dialog"
import {
  getConditionOptions,
  getFieldConfigs,
} from "@/features/contact-filter/components/contact-filter-config"
import {
  buildPipelineItemConfigs,
  pipelineItemConfigName,
} from "@/features/contact-filter/components/pipeline-item-filter-config"
import { collectFilterValueIds } from "@/features/contact-filter/lib/filter-value-labels"
import {
  contactFilterCriteriaSchema,
  singleContactFilterConditionSchema,
} from "@/features/contact-filter/schema"

const t = (key: string) => key
const SALES = "11"
const pipelines = [
  {
    id: SALES,
    name: "Sales",
    referenceName: "sales",
    statusLabels: { open: "Ongoing", won: "Closed won", lost: "Closed lost" },
    stages: [
      { id: "21", name: "Lead" },
      { id: "22", name: "Qualified" },
    ],
  },
]

const parse = (condition: Record<string, unknown>) =>
  singleContactFilterConditionSchema.safeParse({
    field: "pipelineItem",
    ...condition,
  })

describe("pipelineItem condition schema", () => {
  test.each([
    [
      "exists in any pipeline",
      {
        attribute: "exists",
        pipelineId: null,
        operator: "isNotEmpty",
        value: "any",
      },
    ],
    [
      "has no open item",
      {
        attribute: "exists",
        pipelineId: SALES,
        operator: "isEmpty",
        value: "open",
      },
    ],
    [
      "status in a list",
      {
        attribute: "status",
        pipelineId: null,
        operator: "in",
        value: ["open", "lost"],
      },
    ],
    [
      "stage in a pipeline",
      {
        attribute: "stage",
        pipelineId: SALES,
        operator: "notIn",
        value: ["21"],
      },
    ],
    [
      "priority in a pipeline",
      {
        attribute: "priority",
        pipelineId: SALES,
        operator: "in",
        value: ["high"],
      },
    ],
  ])("accepts %s", (_label, condition) => {
    expect(parse(condition).success).toBe(true)
  })

  test.each([
    [
      "stage without a pipeline",
      { attribute: "stage", pipelineId: null, operator: "in", value: ["21"] },
    ],
    [
      "stage with an empty list",
      { attribute: "stage", pipelineId: SALES, operator: "in", value: [] },
    ],
    [
      "stage id that is not numeric",
      {
        attribute: "stage",
        pipelineId: SALES,
        operator: "in",
        value: ["lead"],
      },
    ],
    [
      "pipeline id that is not numeric",
      {
        attribute: "status",
        pipelineId: "abc",
        operator: "in",
        value: ["open"],
      },
    ],
    [
      "status that does not exist",
      {
        attribute: "status",
        pipelineId: null,
        operator: "in",
        value: ["archived"],
      },
    ],
    [
      "status with a single string",
      { attribute: "status", pipelineId: null, operator: "in", value: "open" },
    ],
    [
      "status with the exists operators",
      {
        attribute: "status",
        pipelineId: null,
        operator: "isEmpty",
        value: ["open"],
      },
    ],
    [
      "exists with the membership operators",
      { attribute: "exists", pipelineId: null, operator: "in", value: "any" },
    ],
    [
      "exists with a list",
      {
        attribute: "exists",
        pipelineId: null,
        operator: "isNotEmpty",
        value: ["any"],
      },
    ],
    [
      "exists with an unknown status",
      {
        attribute: "exists",
        pipelineId: null,
        operator: "isNotEmpty",
        value: "closed",
      },
    ],
    [
      "unknown attribute",
      { attribute: "title", pipelineId: null, operator: "in", value: ["a"] },
    ],
    [
      "missing pipelineId",
      { attribute: "priority", operator: "in", value: ["low"] },
    ],
  ])("rejects %s", (_label, condition) => {
    expect(parse(condition).success).toBe(false)
  })

  test("is accepted inside a criteria object with other conditions", () => {
    const parsed = contactFilterCriteriaSchema.safeParse({
      operator: "and",
      conditions: [
        { field: "email", operator: "contains", value: "@x.io" },
        {
          field: "pipelineItem",
          attribute: "priority",
          pipelineId: null,
          operator: "in",
          value: ["low"],
        },
      ],
    })
    expect(parsed.success).toBe(true)
  })
})

describe("pipelineItem filter UI configs", () => {
  const configs = buildPipelineItemConfigs({ t, pipelines })
  const byName = (target: Parameters<typeof pipelineItemConfigName>[0]) =>
    configs.find((config) => config.name === pipelineItemConfigName(target))

  test("offers three attributes for any pipeline and four per pipeline", () => {
    expect(configs.map((config) => config.name)).toEqual([
      "pipelineItem:exists:any",
      "pipelineItem:status:any",
      "pipelineItem:priority:any",
      "pipelineItem:exists:11",
      "pipelineItem:status:11",
      "pipelineItem:stage:11",
      "pipelineItem:priority:11",
    ])
  })

  test("offers nothing in a workspace without pipelines", () => {
    expect(buildPipelineItemConfigs({ t, pipelines: [] })).toEqual([])
  })

  test("stage options are the pipeline stages and status options use its labels", () => {
    expect(byName({ attribute: "stage", pipelineId: SALES })?.options).toEqual([
      { value: "21", label: "Lead" },
      { value: "22", label: "Qualified" },
    ])
    expect(
      byName({ attribute: "status", pipelineId: SALES })?.options?.[0],
    ).toEqual({
      value: "open",
      label: "Ongoing",
    })
    expect(
      byName({ attribute: "status", pipelineId: null })?.options?.[0],
    ).toEqual({ value: "open", label: "pipelines.filter.statusLabels.open" })
  })

  test("builds the stored condition for each attribute", () => {
    const stage = byName({ attribute: "stage", pipelineId: SALES })
    expect(
      buildConditionDraft(
        { field: stage?.name ?? "", operator: "in", value: ["21"] },
        stage,
      ),
    ).toEqual({
      field: "pipelineItem",
      attribute: "stage",
      pipelineId: SALES,
      operator: "in",
      value: ["21"],
    })

    // `isEmpty` still keeps the status to look for.
    const exists = byName({ attribute: "exists", pipelineId: null })
    expect(
      buildConditionDraft(
        { field: exists?.name ?? "", operator: "isEmpty", value: "won" },
        exists,
      ),
    ).toEqual({
      field: "pipelineItem",
      attribute: "exists",
      pipelineId: null,
      operator: "isEmpty",
      value: "won",
    })
  })

  test("round-trips a stored condition back to its form draft", () => {
    const draft = buildDraftFromCondition({
      field: "pipelineItem",
      attribute: "status",
      pipelineId: SALES,
      operator: "notIn",
      value: ["lost"],
    })
    expect(draft).toEqual({
      field: "pipelineItem:status:11",
      operator: "notIn",
      value: ["lost"],
    })
  })

  test("operators and defaults follow the attribute", () => {
    const labels = getConditionOptions(t)
    const exists = byName({ attribute: "exists", pipelineId: SALES })
    const stage = byName({ attribute: "stage", pipelineId: SALES })

    expect(
      getConditionOptionsForConfig(exists, labels).map(
        (option) => option.value,
      ),
    ).toEqual(["isNotEmpty", "isEmpty"])
    expect(
      getConditionOptionsForConfig(exists, labels).map(
        (option) => option.label,
      ),
    ).toEqual([
      "condition.pipelineItem.operators.has",
      "condition.pipelineItem.operators.hasNo",
    ])
    expect(
      getConditionOptionsForConfig(stage, labels).map((option) => option.value),
    ).toEqual(["in", "notIn"])
    expect(getDefaultConditionValue(exists, "isNotEmpty")).toBe("any")
    expect(getDefaultConditionValue(stage, "in")).toEqual([])
  })

  test("getFieldConfigs groups the pipeline configs and names stages by id", () => {
    const all = getFieldConfigs({
      t,
      tagOptions: [],
      inboxOptions: [],
      flowVersionOptions: [],
      customFields: [],
      pipelineOptions: pipelines,
      filterValueLabels: {
        tags: [],
        sequences: [],
        broadcasts: [],
        reflinks: [],
        inboxes: [],
        members: [],
        inboxTeams: [],
        flows: [],
        flowNodes: [],
        keywords: [],
        whatsappFlows: [],
        emailTopics: [],
        pipelines: [],
        pipelineStages: [{ id: "21", name: "Lead" }],
        ads: [],
      },
    })
    const stage = all.find((config) => config.name === "pipelineItem:stage:11")
    expect(stage?.group).toBe("pipeline")
    expect(stage?.valueLabels).toEqual([{ value: "21", label: "Lead" }])
  })
})

describe("collectFilterValueIds for pipelineItem", () => {
  test("collects the pipeline and, for stage conditions, the stage ids", () => {
    expect(
      collectFilterValueIds([
        {
          field: "pipelineItem",
          attribute: "stage",
          pipelineId: SALES,
          value: ["21", "22"],
        },
        {
          field: "pipelineItem",
          attribute: "status",
          pipelineId: "12",
          value: ["open"],
        },
        {
          field: "pipelineItem",
          attribute: "priority",
          pipelineId: null,
          value: ["low"],
        },
      ]),
    ).toEqual({ pipelines: [SALES, "12"], pipelineStages: ["21", "22"] })
  })
})

describe("pipelineItem on the flow Condition surface", () => {
  const base = {
    t,
    tagOptions: [],
    inboxOptions: [],
    flowVersionOptions: [],
    customFields: [],
    pipelineOptions: pipelines,
  }

  test("is offered on the contacts surface", () => {
    const names = getFieldConfigs({ ...base, surface: "contacts" }).map(
      (config) => config.name,
    )
    expect(names).toContain("pipelineItem:stage:11")
  })

  test("is not offered on the flowCondition surface", () => {
    const configs = getFieldConfigs({ ...base, surface: "flowCondition" })
    expect(configs.some((config) => config.pipelineItem)).toBe(false)
    expect(
      configs.some((config) => config.name.startsWith("pipelineItem:")),
    ).toBe(false)
  })
})
