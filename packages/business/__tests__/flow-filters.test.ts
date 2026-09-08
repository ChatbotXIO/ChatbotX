import { stepTypes } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import {
  filterFlowsByStartStepType,
  filterFlowsByTemplateIds,
  hasStartNode,
} from "../src/flow/filters"

type TestFlow = {
  id: string
  flowVersions: Array<{ nodes: unknown }>
}

const flowWithSteps = (
  id: string,
  steps: Array<{ stepType?: string; template?: { id?: string } }>,
  options?: { isStartNode?: boolean },
): TestFlow => ({
  id,
  flowVersions: [
    {
      nodes: [
        {
          id: "node-1",
          data: {
            isStartNode: options?.isStartNode ?? true,
            details: { steps },
          },
        },
      ],
    },
  ],
})

describe("flow filters", () => {
  test("detects a step on the start node only", () => {
    expect(
      hasStartNode(
        [
          {
            data: {
              isStartNode: true,
              details: {
                steps: [{ stepType: stepTypes.enum.sendWaTemplateMessage }],
              },
            },
          },
        ],
        stepTypes.enum.sendWaTemplateMessage,
      ),
    ).toBe(true)

    expect(
      hasStartNode(
        [
          {
            data: {
              isStartNode: false,
              details: {
                steps: [{ stepType: stepTypes.enum.sendWaTemplateMessage }],
              },
            },
          },
        ],
        stepTypes.enum.sendWaTemplateMessage,
      ),
    ).toBe(false)

    expect(hasStartNode(null, stepTypes.enum.sendWaTemplateMessage)).toBe(false)
  })

  test("filters flows by WhatsApp, Messenger, and legacy WhatsApp step types", () => {
    const whatsappFlow = flowWithSteps("wa", [
      { stepType: stepTypes.enum.sendWaTemplateMessage },
    ])
    const legacyWhatsappFlow = flowWithSteps("legacy-wa", [
      { stepType: "WA_TM01" },
    ])
    const messengerFlow = flowWithSteps("messenger", [
      { stepType: stepTypes.enum.sendMessengerTemplateMessage },
    ])
    const nonStartFlow = flowWithSteps(
      "non-start",
      [{ stepType: stepTypes.enum.sendWaTemplateMessage }],
      { isStartNode: false },
    )

    expect(
      filterFlowsByStartStepType(
        [whatsappFlow, legacyWhatsappFlow, messengerFlow, nonStartFlow],
        stepTypes.enum.sendWaTemplateMessage,
      ).map((flow) => flow.id),
    ).toEqual(["wa", "legacy-wa"])

    expect(
      filterFlowsByStartStepType(
        [whatsappFlow, legacyWhatsappFlow, messengerFlow],
        stepTypes.enum.sendMessengerTemplateMessage,
      ).map((flow) => flow.id),
    ).toEqual(["messenger"])
  })

  test("filters WhatsApp template ids across current and legacy step types", () => {
    const currentTemplateFlow = flowWithSteps("current-template", [
      {
        stepType: stepTypes.enum.sendWaTemplateMessage,
        template: { id: "template-1" },
      },
    ])
    const legacyTemplateFlow = flowWithSteps("legacy-template", [
      { stepType: "WA_TM01", template: { id: "template-1" } },
    ])
    const wrongTemplateFlow = flowWithSteps("wrong-template", [
      {
        stepType: stepTypes.enum.sendWaTemplateMessage,
        template: { id: "template-2" },
      },
    ])
    const wrongStartTemplateFlow: TestFlow = {
      id: "wrong-start-template",
      flowVersions: [
        {
          nodes: [
            {
              id: "start-node",
              data: {
                isStartNode: true,
                details: {
                  steps: [
                    {
                      stepType: stepTypes.enum.sendWaTemplateMessage,
                      template: { id: "template-2" },
                    },
                  ],
                },
              },
            },
            {
              id: "non-start-node",
              data: {
                isStartNode: false,
                details: {
                  steps: [
                    {
                      stepType: stepTypes.enum.sendWaTemplateMessage,
                      template: { id: "template-1" },
                    },
                  ],
                },
              },
            },
          ],
        },
      ],
    }

    expect(
      filterFlowsByTemplateIds(
        [
          currentTemplateFlow,
          legacyTemplateFlow,
          wrongTemplateFlow,
          wrongStartTemplateFlow,
        ],
        ["template-1"],
      ).map((flow) => flow.id),
    ).toEqual(["current-template", "legacy-template"])

    expect(filterFlowsByTemplateIds([currentTemplateFlow], [])).toEqual([])
  })
})
