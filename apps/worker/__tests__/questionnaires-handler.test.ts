import { beforeEach, describe, expect, test, vi } from "vitest"
import type { ExecuteStepProps } from "../src/integration/handlers/flow-utils"

const mocks = vi.hoisted(() => ({
  updateChallenge: vi.fn(async () => undefined),
  runQuestionnaireEngine: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  conversationService: {
    updateChallenge: mocks.updateChallenge,
  },
}))

vi.mock("../src/questionnaires/services/engine", () => ({
  runQuestionnaireEngine: mocks.runQuestionnaireEngine,
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: mocks.loggerError,
    warn: mocks.loggerWarn,
  },
}))

const { questionnaires } = await import(
  "../src/integration/handlers/questionnaires"
)

function makeProps(): ExecuteStepProps<never> {
  return {
    conversation: {
      id: "conversation-1",
      workspaceId: "workspace-1",
      contactId: "contact-1",
      additionalAttributes: {},
    },
    step: {
      id: "step-1",
      stepType: "questionnaires",
      mode: "start",
      questionnaireId: "questionnaire-1",
    },
  } as ExecuteStepProps<never>
}

describe("questionnaires handler", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("clears the challenge and returns error when the engine throws", async () => {
    mocks.runQuestionnaireEngine.mockRejectedValueOnce(new Error("boom"))

    await expect(questionnaires(makeProps())).resolves.toEqual({
      status: "error",
      result: null,
    })

    expect(mocks.updateChallenge).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      conversationId: "conversation-1",
      challenge: undefined,
    })
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        conversationId: "conversation-1",
        contactId: "contact-1",
        questionnaireId: "questionnaire-1",
        mode: "start",
      }),
      "Questionnaires step failed",
    )
  })
})
