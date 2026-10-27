// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { resolveTemplateEntry } = vi.hoisted(() => ({
  resolveTemplateEntry: vi.fn(),
}))

vi.mock("../src/pipeline/pipeline-template.service", () => ({
  pipelineTemplateService: { resolveTemplateEntry },
}))

const { resolvePipelineManifest } = await import(
  "../src/template/adapters/manifests/pipelines"
)
const {
  collectFlowReferenceWarnings,
  remapFlowGraphReferences,
  pipelineStepDefaultFn,
  templateManifestsSchema,
} = await import("@chatbotx.io/flow-config")

const entry = {
  name: "Sales",
  referenceName: "sales",
  type: "opportunity" as const,
  currency: "USD",
  settings: {},
  stages: [],
  fields: [],
}

const buildContext = () => ({
  tx: {} as never,
  workspaceId: "ws-1",
  installationId: "install-1",
  idMaps: {} as Record<string, Map<string, string>>,
  track: vi.fn(),
  warn: vi.fn(),
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe("resolvePipelineManifest", () => {
  test("fills pipeline, stage and field id maps and tracks provenance", async () => {
    resolveTemplateEntry.mockResolvedValue({
      pipeline: { id: "target-p" },
      created: true,
      stageIds: new Map([["src-st", "target-st"]]),
      fieldIds: new Map([["src-f", "target-f"]]),
      unmatchedStages: [],
      unmatchedFields: [],
    })
    const ctx = buildContext()

    await resolvePipelineManifest(ctx, { "src-p": entry })

    expect(ctx.idMaps.pipeline?.get("src-p")).toBe("target-p")
    expect(ctx.idMaps.pipelineStage?.get("src-st")).toBe("target-st")
    expect(ctx.idMaps.pipelineField?.get("src-f")).toBe("target-f")
    expect(ctx.track).toHaveBeenCalledWith({
      category: "flows",
      resourceKind: "pipeline",
      resourceId: "target-p",
      sourceResourceId: "src-p",
      wasExisting: false,
    })
    expect(ctx.warn).not.toHaveBeenCalled()
  })

  test("a matched pipeline is tracked as existing and unmatched ids warn", async () => {
    resolveTemplateEntry.mockResolvedValue({
      pipeline: { id: "target-p" },
      created: false,
      stageIds: new Map(),
      fieldIds: new Map(),
      unmatchedStages: ["src-st"],
      unmatchedFields: ["src-f"],
    })
    const ctx = buildContext()

    await resolvePipelineManifest(ctx, { "src-p": entry })

    expect(ctx.track.mock.calls[0][0].wasExisting).toBe(true)
    expect(ctx.warn.mock.calls.map(([w]) => w.entityKind).sort()).toEqual([
      "pipelineField",
      "pipelineStage",
    ])
    expect(ctx.idMaps.pipelineStage?.size).toBe(0)
  })

  test("an empty manifest does nothing", async () => {
    const ctx = buildContext()
    await resolvePipelineManifest(ctx, {})
    expect(resolveTemplateEntry).not.toHaveBeenCalled()
    expect(ctx.idMaps).toEqual({})
  })
})

describe("flow graph remap of Pipelines steps", () => {
  test("rewrites pipeline, stage, destination and field ids", () => {
    const step = {
      ...pipelineStepDefaultFn("addToPipeline", { pipelineId: "src-p" }),
      stageId: "src-st",
      fieldValues: [{ pipelineFieldId: "src-f", value: "x" }],
    }
    const transfer = pipelineStepDefaultFn("transfer", { pipelineId: "src-p" })
    const graph = {
      nodes: [
        {
          id: "n1",
          data: {
            steps: [
              step,
              {
                ...transfer,
                destinationPipelineId: "src-p2",
                destinationStageId: "src-st2",
              },
            ],
          },
        },
      ],
      edges: [],
    }
    const idMaps = {
      pipeline: new Map([
        ["src-p", "t-p"],
        ["src-p2", "t-p2"],
      ]),
      pipelineStage: new Map([
        ["src-st", "t-st"],
        ["src-st2", "t-st2"],
      ]),
      pipelineField: new Map([["src-f", "t-f"]]),
    }
    const unresolved: string[] = []

    const remapped = remapFlowGraphReferences(graph as never, idMaps, {
      kinds: ["pipeline", "pipelineStage", "pipelineField"],
      onUnresolved: (ref) => unresolved.push(ref.value),
    })

    const steps = (
      remapped.nodes[0] as unknown as {
        data: { steps: Record<string, unknown>[] }
      }
    ).data.steps
    expect(steps[0]).toMatchObject({
      pipelineId: "t-p",
      stageId: "t-st",
      fieldValues: [{ pipelineFieldId: "t-f", value: "x" }],
    })
    expect(steps[1]).toMatchObject({
      pipelineId: "t-p",
      destinationPipelineId: "t-p2",
      destinationStageId: "t-st2",
    })
    expect(unresolved).toEqual([])
  })

  test("an unmapped id is reported, not rewritten", () => {
    const graph = {
      nodes: [
        {
          id: "n1",
          data: {
            steps: [
              pipelineStepDefaultFn("moveToStage", { pipelineId: "src-p" }),
            ],
          },
        },
      ],
      edges: [],
    }
    const unresolved: string[] = []
    remapFlowGraphReferences(
      graph as never,
      {},
      {
        kinds: ["pipeline"],
        onUnresolved: (ref) => unresolved.push(ref.entityKind),
      },
    )
    expect(unresolved).toEqual(["pipeline"])
  })
})

describe("assignees of Pipelines steps", () => {
  const graph = () => ({
    nodes: [
      {
        id: "n1",
        data: {
          steps: [
            {
              ...pipelineStepDefaultFn("addToPipeline", {
                pipelineId: "src-p",
              }),
              assigneeMemberIds: ["m-1", "m-2"],
              assigneeInboxTeamIds: ["t-1"],
            },
            {
              ...pipelineStepDefaultFn("assign", { pipelineId: "src-p" }),
              assigneeMemberIds: ["m-3"],
              assigneeInboxTeamIds: [],
            },
          ],
        },
      },
    ],
    edges: [],
  })
  const stepsOf = (g: { nodes: unknown[] }) =>
    (g.nodes[0] as { data: { steps: Record<string, unknown>[] } }).data.steps

  test("a template/flow install strips foreign assignees and reports them", () => {
    const warnings: { entityKind: string; value: string }[] = []
    const remapped = remapFlowGraphReferences(
      graph() as never,
      {},
      {
        kinds: ["pipeline", "workspaceMember", "inboxTeam"],
        onUnresolved: (ref) => warnings.push(ref),
      },
    )
    const [add, assign] = stepsOf(remapped)
    expect(add).toMatchObject({
      assigneeMemberIds: [],
      assigneeInboxTeamIds: [],
    })
    expect(assign).toMatchObject({
      assigneeMemberIds: [],
      assigneeInboxTeamIds: [],
    })
    expect(
      warnings
        .filter((w) => w.entityKind !== "pipeline")
        .map((w) => `${w.entityKind}:${w.value}`)
        .sort(),
    ).toEqual([
      "inboxTeam:t-1",
      "workspaceMember:m-1",
      "workspaceMember:m-2",
      "workspaceMember:m-3",
    ])
  })

  test("a mapped assignee would be kept (only unresolved ids are stripped)", () => {
    const remapped = remapFlowGraphReferences(
      graph() as never,
      { workspaceMember: new Map([["m-1", "x-1"]]) },
      {
        kinds: ["workspaceMember"],
      },
    )
    expect(stepsOf(remapped)[0]).toMatchObject({ assigneeMemberIds: ["x-1"] })
  })

  test("single-flow import preview warns about them", () => {
    const kinds = collectFlowReferenceWarnings(graph() as never).map(
      (w) => w.entityKind,
    )
    expect(kinds).toContain("workspaceMember")
    expect(kinds).toContain("inboxTeam")
  })

  test("the original graph is not mutated", () => {
    const g = graph()
    remapFlowGraphReferences(g as never, {}, { kinds: ["workspaceMember"] })
    expect(stepsOf(g)[0]).toMatchObject({ assigneeMemberIds: ["m-1", "m-2"] })
  })
})

describe("template manifest schema", () => {
  test("an older payload without pipelines still parses", () => {
    expect(templateManifestsSchema.parse({}).pipelines).toEqual({})
  })

  test("validates a pipeline entry", () => {
    const parsed = templateManifestsSchema.parse({
      pipelines: { p: { ...entry, stages: [{ sourceId: "s", name: "New" }] } },
    })
    expect(parsed.pipelines.p?.stages[0]?.description).toBeNull()
    expect(() =>
      templateManifestsSchema.parse({
        pipelines: { p: { ...entry, type: "nope" } },
      }),
    ).toThrow()
  })
})
