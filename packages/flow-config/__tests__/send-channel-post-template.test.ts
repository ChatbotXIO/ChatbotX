import { describe, expect, test } from "vitest"
import { z } from "zod"
import {
  collectFlowReferenceWarnings,
  type FlowExportedFlow,
  refineStepsByChannel,
  removeUnresolvedReferencesDetailed,
  sendChannelPostStepSchema,
} from "../src"
import { REFERENCE_KIND_POLICY } from "../src/import-export/reference-fields"
import { flowVersionSchema } from "../src/nodes"
import { sendMessageNodeDefaultFn } from "../src/nodes/send-message"
import { chooseChannelStepDefaultFn } from "../src/steps/choose-channel"
import { sendChannelPostStepDefaultFn } from "../src/steps/send-channel-post"

const exportedNodes = () => [
  sendMessageNodeDefaultFn({
    detailProps: {
      beforeStep: chooseChannelStepDefaultFn({ channel: "instagram" }),
      steps: [sendChannelPostStepDefaultFn({ channelPostId: "9001" })],
    },
  }),
]

const exportedFlow = (): FlowExportedFlow =>
  ({ nodes: exportedNodes(), edges: [] }) as unknown as FlowExportedFlow

describe("sendChannelPost in a template", () => {
  test("a post is workspace-bound: its reference kind is stripped, never kept", () => {
    expect(REFERENCE_KIND_POLICY.channelPost).toBe("strip")
  })

  test("export reports the post as a reference of kind channelPost", () => {
    const warnings = collectFlowReferenceWarnings(exportedFlow())
    expect(warnings).toEqual([
      expect.objectContaining({
        entityKind: "channelPost",
        value: "9001",
        path: "nodes[0].data.details.steps[0].channelPostId",
      }),
    ])
  })

  test("install leaves the step in place with no post, and it still parses", () => {
    const flow = exportedFlow()
    const warnings = collectFlowReferenceWarnings(flow)
    const result = removeUnresolvedReferencesDetailed(flow, warnings)

    expect(result.blocked).toEqual([])
    const step = (
      result.value as unknown as {
        nodes: { data: { details: { steps: unknown[] } } }[]
      }
    ).nodes[0]?.data.details.steps[0]
    expect(step).toMatchObject({
      stepType: "sendChannelPost",
      channelPostId: "",
    })
    expect(sendChannelPostStepSchema.safeParse(step).success).toBe(true)
  })

  test("publishing the stripped step is refused until a post is picked", () => {
    const flow = exportedFlow()
    const stripped = removeUnresolvedReferencesDetailed(
      flow,
      collectFlowReferenceWarnings(flow),
    ).value as unknown as { nodes: unknown[] }

    const refused = z
      .array(flowVersionSchema)
      .superRefine(refineStepsByChannel)
      .safeParse(stripped.nodes)
    expect(refused.success).toBe(false)
    if (!refused.success) {
      expect(refused.error.issues.map((issue) => issue.message)).toContain(
        "sendChannelPostPostRequired",
      )
    }

    const picked = z
      .array(flowVersionSchema)
      .superRefine(refineStepsByChannel)
      .safeParse(exportedNodes())
    expect(picked.success).toBe(true)
  })
})
