import { describe, expect, test } from "vitest"
import { updateQuestionnaireRequest } from "../src/features/questionnaires/schemas/action"
import {
  getCustomFieldSelectionReset,
  getQuestionFieldMappingReset,
} from "../src/features/questionnaires/utils/field-mapping"
import { duplicateQuestionnaireQuestionDraft } from "../src/features/questionnaires/utils/question"

describe("updateQuestionnaireRequest", () => {
  test("accepts question active state and image metadata", () => {
    const parsed = updateQuestionnaireRequest.parse({
      triggerFlowId: null,
      enableScore: false,
      enableRetryMessages: false,
      enableCustomFieldMapping: false,
      questions: [
        {
          title: "Email",
          type: "email",
          active: true,
          image: { mode: "url", url: "https://example.com/question.png" },
          point: 1,
          retryMessage: null,
          customFieldId: null,
          config: null,
        },
      ],
    })

    expect(parsed.questions[0]).toMatchObject({
      active: true,
      image: { mode: "url", url: "https://example.com/question.png" },
    })
  })

  test("accepts writable system field keys as response mappings", () => {
    const parsed = updateQuestionnaireRequest.parse({
      triggerFlowId: null,
      enableScore: false,
      enableRetryMessages: false,
      enableCustomFieldMapping: true,
      questions: [
        {
          title: "Email",
          type: "email",
          active: true,
          image: null,
          customFieldId: "email",
        },
      ],
    })

    expect(parsed.questions[0]?.customFieldId).toBe("email")
  })

  test("duplicates a question draft without keeping the persisted question id", () => {
    const duplicated = duplicateQuestionnaireQuestionDraft({
      id: "question-1",
      title: "Email",
      type: "email",
      active: true,
      image: null,
      point: 1,
      retryMessage: null,
      customFieldId: "email",
      config: null,
    })

    expect(duplicated).toMatchObject({
      id: undefined,
      title: "Email",
      customFieldId: "email",
    })
  })

  test("resets stale system field mapping when a custom field is selected", () => {
    const reset = getCustomFieldSelectionReset()
    const parsed = updateQuestionnaireRequest.parse({
      triggerFlowId: null,
      enableScore: false,
      enableRetryMessages: false,
      enableCustomFieldMapping: true,
      questions: [
        {
          title: "Email",
          type: "email",
          active: true,
          image: null,
          customFieldId: "123",
          systemFieldKey: reset.systemFieldKey,
        },
      ],
    })

    expect(parsed.questions[0]).toMatchObject({
      customFieldId: "123",
      systemFieldKey: null,
    })
  })

  test("resets field mappings when the response type changes", () => {
    const reset = getQuestionFieldMappingReset()
    const parsed = updateQuestionnaireRequest.parse({
      triggerFlowId: null,
      enableScore: false,
      enableRetryMessages: false,
      enableCustomFieldMapping: true,
      questions: [
        {
          title: "Age",
          type: "number",
          active: true,
          image: null,
          customFieldId: reset.customFieldId,
          systemFieldKey: reset.systemFieldKey,
        },
      ],
    })

    expect(parsed.questions[0]).toMatchObject({
      customFieldId: null,
      systemFieldKey: null,
    })
  })

  test("rejects unsupported question types", () => {
    expect(() =>
      updateQuestionnaireRequest.parse({
        triggerFlowId: null,
        enableScore: false,
        enableRetryMessages: false,
        enableCustomFieldMapping: false,
        questions: [
          {
            title: "Upload a file",
            type: "file",
            active: true,
            image: null,
          },
        ],
      }),
    ).toThrow()
  })

  test("rejects blank question titles", () => {
    expect(() =>
      updateQuestionnaireRequest.parse({
        triggerFlowId: null,
        enableScore: false,
        enableRetryMessages: false,
        enableCustomFieldMapping: false,
        questions: [
          {
            title: "   ",
            type: "text",
            active: true,
            image: null,
          },
        ],
      }),
    ).toThrow()
  })
})
