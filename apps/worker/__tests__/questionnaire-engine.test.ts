import { beforeEach, describe, expect, test, vi } from "vitest"
import type { ExecuteStepProps } from "../src/integration/handlers/flow-utils"

const mocks = vi.hoisted(() => ({
  updateChallenge: vi.fn(async () => undefined),
  startOrResume: vi.fn(),
  answerCurrent: vi.fn(),
  markQuestionSent: vi.fn(async () => undefined),
  deleteApplicant: vi.fn(async () => undefined),
  cancel: vi.fn(async () => undefined),
  chatQueueAdd: vi.fn(async () => undefined),
  integrationQueueAdd: vi.fn(async () => undefined),
  waitForChatJobCompletion: vi.fn(async () => undefined),
  findLastByConversation: vi.fn(async () => [{ text: "bad input" }]),
  findById: vi.fn(async () => null),
  safeSinceTime: new Date("2025-01-01T00:00:00Z"),
  getSafeSinceTime: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  conversationService: {
    updateChallenge: mocks.updateChallenge,
  },
  questionnaireSubmissionService: {
    startOrResume: mocks.startOrResume,
    answerCurrent: mocks.answerCurrent,
    markQuestionSent: mocks.markQuestionSent,
    deleteApplicant: mocks.deleteApplicant,
    cancel: mocks.cancel,
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: vi.fn(async () => ({
    findById: mocks.findById,
    findLastByConversation: mocks.findLastByConversation,
  })),
  getSafeSinceTime: mocks.getSafeSinceTime,
}))

vi.mock("@chatbotx.io/events/context", () => ({
  webhookChannelOrigin: () => "channel",
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: { sendChatMessage: "sendChatMessage" },
  IntegrationJobAction: { sendFlow: "sendFlow" },
  chatQueue: { add: mocks.chatQueueAdd },
  integrationQueue: { add: mocks.integrationQueueAdd },
}))

vi.mock("../src/integration/utils/message", () => ({
  waitForChatJobCompletion: mocks.waitForChatJobCompletion,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { runQuestionnaireEngine } = await import(
  "../src/questionnaires/services/engine"
)

const question = {
  id: "question-1",
  title: "What is your email?",
  type: "email",
  active: true,
  image: { mode: "url", url: "https://example.com/question.png" },
  config: null,
}

function makeProps(
  overrides: Partial<ExecuteStepProps<never>> = {},
): ExecuteStepProps<never> {
  return {
    conversation: {
      id: "conversation-1",
      workspaceId: "workspace-1",
      contactId: "contact-1",
      additionalAttributes: {},
      lastActivityAt: new Date("2026-01-01T00:00:00Z"),
      createdAt: new Date("2026-01-01T00:00:00Z"),
    },
    contactInbox: {
      id: "contact-inbox-1",
      contactId: "contact-1",
      channel: "messenger",
    },
    flowVersion: {
      id: "flow-version-1",
      flowId: "flow-1",
      nodes: [],
      edges: [],
    },
    useLatestFlowVersion: false,
    targetId: "node-1",
    targetNodeId: "node-1",
    step: {
      id: "step-1",
      stepType: "questionnaires",
      mode: "start",
      questionnaireId: "questionnaire-1",
    },
    ctx: { variables: { conversation: {} } },
    ...overrides,
  } as ExecuteStepProps<never>
}

describe("runQuestionnaireEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.startOrResume.mockResolvedValue({
      status: "wait",
      submission: { id: "submission-1" },
      question,
    })
    mocks.findById.mockResolvedValue(null)
    mocks.getSafeSinceTime.mockReturnValue(mocks.safeSinceTime)
  })

  test("sends question image in the same chat job and stores zero attempts on first send", async () => {
    await expect(runQuestionnaireEngine(makeProps())).resolves.toEqual({
      status: "wait",
      result: null,
    })

    expect(mocks.chatQueueAdd).toHaveBeenCalledWith("sendChatMessage", {
      type: "sendChatMessage",
      data: expect.objectContaining({
        text: "What is your email?",
        url: "https://example.com/question.png",
      }),
    })
    expect(mocks.updateChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        challenge: expect.objectContaining({
          data: expect.objectContaining({ attempts: 0 }),
        }),
      }),
    )
  })

  test("offers Messenger's native email quick reply for an email question", async () => {
    await runQuestionnaireEngine(makeProps())

    expect(mocks.chatQueueAdd).toHaveBeenCalledWith("sendChatMessage", {
      type: "sendChatMessage",
      data: expect.objectContaining({
        text: "What is your email?",
        quickReplies: [
          {
            id: "messenger:native-quick-reply:user_email",
            label: "What is your email?",
            buttonType: "postback",
            postback: "messenger:native-quick-reply:user_email",
          },
        ],
      }),
    })
  })

  test("offers Messenger's native phone quick reply for a phone question", async () => {
    mocks.startOrResume.mockResolvedValue({
      status: "wait",
      submission: { id: "submission-1" },
      question: { ...question, type: "phone", title: "What is your phone?" },
    })

    await runQuestionnaireEngine(makeProps())

    expect(mocks.chatQueueAdd).toHaveBeenCalledWith("sendChatMessage", {
      type: "sendChatMessage",
      data: expect.objectContaining({
        quickReplies: [
          expect.objectContaining({
            id: "messenger:native-quick-reply:user_phone_number",
            postback: "messenger:native-quick-reply:user_phone_number",
          }),
        ],
      }),
    })
  })

  test("does not offer a native quick reply outside Messenger", async () => {
    await runQuestionnaireEngine(
      makeProps({
        contactInbox: {
          id: "contact-inbox-1",
          contactId: "contact-1",
          channel: "webchat",
        },
      }),
    )

    expect(mocks.chatQueueAdd).toHaveBeenCalledWith("sendChatMessage", {
      type: "sendChatMessage",
      data: expect.objectContaining({ quickReplies: undefined }),
    })
  })

  test("stops the flow when the contact already submitted the questionnaire", async () => {
    mocks.startOrResume.mockResolvedValue({
      status: "skip",
      reason: "questionnaire_already_submitted",
    })

    await expect(runQuestionnaireEngine(makeProps())).resolves.toEqual({
      status: "wait",
      result: "questionnaire_already_submitted",
    })

    expect(mocks.chatQueueAdd).not.toHaveBeenCalled()
    expect(mocks.updateChallenge).not.toHaveBeenCalled()
  })

  test("starts the configured questionnaire when a stale challenge has no active submission", async () => {
    mocks.answerCurrent.mockResolvedValue({
      status: "skip",
      reason: "submission_not_found",
    })

    await expect(
      runQuestionnaireEngine(
        makeProps({
          conversation: {
            ...makeProps().conversation,
            additionalAttributes: {
              challenge: { type: "step", data: { stepId: "old-step" } },
            },
          },
        }),
      ),
    ).resolves.toEqual({
      status: "wait",
      result: null,
    })

    expect(mocks.startOrResume).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      questionnaireId: "questionnaire-1",
      contactId: "contact-1",
      conversationId: "conversation-1",
    })
    expect(mocks.chatQueueAdd).toHaveBeenCalled()
    expect(mocks.updateChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        challenge: expect.objectContaining({
          data: expect.objectContaining({ stepId: "step-1" }),
        }),
      }),
    )
  })

  test("ends an active questionnaire and clears the challenge", async () => {
    const result = await runQuestionnaireEngine(
      makeProps({
        step: {
          ...makeProps().step,
          mode: "end",
        },
      }),
    )

    expect(result).toEqual({ status: "success", result: null })
    expect(mocks.cancel).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      questionnaireId: "questionnaire-1",
      contactId: "contact-1",
    })
    expect(mocks.updateChallenge).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      conversationId: "conversation-1",
      challenge: undefined,
    })
  })

  test("deletes an applicant and clears the challenge", async () => {
    const result = await runQuestionnaireEngine(
      makeProps({
        step: {
          ...makeProps().step,
          mode: "deleteApplicant",
        },
      }),
    )

    expect(result).toEqual({ status: "success", result: null })
    expect(mocks.deleteApplicant).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      questionnaireId: "questionnaire-1",
      contactId: "contact-1",
    })
    expect(mocks.updateChallenge).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      conversationId: "conversation-1",
      challenge: undefined,
    })
  })

  test("retries invalid answers with incremented challenge attempts", async () => {
    mocks.answerCurrent.mockResolvedValue({
      status: "retry",
      submissionId: "submission-1",
      question,
      attempts: 2,
      retryMessage: "Please enter a valid email address",
      reason: "invalid_email",
    })

    const result = await runQuestionnaireEngine(
      makeProps({
        conversation: {
          ...makeProps().conversation,
          additionalAttributes: { challenge: { type: "step", data: {} } },
        },
        ctx: {
          variables: {
            conversation: {
              challengeAttempts: { name: "challengeAttempts", value: 1 },
            },
          },
        },
      }),
    )

    expect(result).toEqual({ status: "retry", result: null })
    expect(mocks.answerCurrent).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: 1 }),
    )
    expect(mocks.startOrResume).not.toHaveBeenCalled()
    expect(mocks.findLastByConversation).toHaveBeenCalledWith(
      "conversation-1",
      expect.objectContaining({
        limit: 1,
        messageTypes: ["incoming"],
        requireCompleteResults: true,
        sinceTime: mocks.safeSinceTime,
        workspaceId: "workspace-1",
      }),
    )
    expect(mocks.updateChallenge).toHaveBeenLastCalledWith(
      expect.objectContaining({
        challenge: expect.objectContaining({
          data: expect.objectContaining({ attempts: 2 }),
        }),
      }),
    )
    expect(mocks.chatQueueAdd).toHaveBeenCalledWith("sendChatMessage", {
      type: "sendChatMessage",
      data: expect.objectContaining({
        text: "Please enter a valid email address",
      }),
    })
  })

  test("uses the trigger message when challenge job carries the message partition key", async () => {
    const triggerMessageCreatedAt = new Date("2026-01-02T00:00:00Z")
    mocks.findById.mockResolvedValue({
      id: "message-1",
      createdAt: triggerMessageCreatedAt,
      workspaceId: "workspace-1",
      conversationId: "conversation-1",
      senderType: "contact",
      messageType: "incoming",
      text: "valid@example.com",
    })
    mocks.answerCurrent.mockResolvedValue({
      status: "completed",
      submissionId: "submission-1",
    })

    const result = await runQuestionnaireEngine(
      makeProps({
        conversation: {
          ...makeProps().conversation,
          additionalAttributes: { challenge: { type: "step", data: {} } },
        },
        triggerMessageId: "message-1",
        triggerMessageCreatedAt,
      }),
    )

    expect(result).toEqual({ status: "success", result: "submission-1" })
    expect(mocks.findById).toHaveBeenCalledWith({
      id: "message-1",
      createdAt: triggerMessageCreatedAt,
      workspaceId: "workspace-1",
    })
    expect(mocks.findLastByConversation).not.toHaveBeenCalled()
    expect(mocks.answerCurrent).toHaveBeenCalledWith(
      expect.objectContaining({
        rawText: "valid@example.com",
        triggerMessageId: "message-1",
      }),
    )
    expect(mocks.integrationQueueAdd).not.toHaveBeenCalled()
  })

  test("resends the current question when answer processing was already advanced for the trigger message", async () => {
    const sentAt = new Date("2026-01-02T00:00:00Z")
    mocks.answerCurrent.mockResolvedValue({
      status: "wait",
      submissionId: "submission-1",
      question: {
        ...question,
        id: "question-2",
        title: "What is your phone number?",
        image: null,
      },
      sentAt,
    })

    const result = await runQuestionnaireEngine(
      makeProps({
        conversation: {
          ...makeProps().conversation,
          additionalAttributes: { challenge: { type: "step", data: {} } },
        },
        triggerMessageId: "message-1",
      }),
    )

    expect(result).toEqual({ status: "wait", result: null })
    expect(mocks.answerCurrent).toHaveBeenCalledWith(
      expect.objectContaining({ triggerMessageId: "message-1" }),
    )
    expect(mocks.chatQueueAdd).toHaveBeenCalledWith("sendChatMessage", {
      type: "sendChatMessage",
      data: expect.objectContaining({
        text: "What is your phone number?",
      }),
    })
    expect(mocks.markQuestionSent).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      submissionId: "submission-1",
      questionId: "question-2",
      sentAt,
    })
  })

  test("starts the configured trigger flow after questionnaire completion", async () => {
    mocks.answerCurrent.mockResolvedValue({
      status: "completed",
      submissionId: "submission-1",
      triggerFlowId: "trigger-flow-1",
    })

    const result = await runQuestionnaireEngine(
      makeProps({
        conversation: {
          ...makeProps().conversation,
          additionalAttributes: { challenge: { type: "step", data: {} } },
        },
        metadata: { type: "updateStatus" },
        sendFrom: "inbox",
      }),
    )

    expect(result).toEqual({ status: "success", result: "submission-1" })
    expect(mocks.integrationQueueAdd).toHaveBeenCalledWith("sendFlow", {
      type: "sendFlow",
      data: expect.objectContaining({
        conversationId: "conversation-1",
        contactInboxId: "contact-inbox-1",
        flowId: "trigger-flow-1",
        metadata: { type: "updateStatus" },
        origin: "channel",
        sendFrom: "inbox",
      }),
    })
  })

  test("parses serialized conversation timestamps before reading sharded messages", async () => {
    mocks.answerCurrent.mockResolvedValue({
      status: "skip",
      reason: "question_missing",
    })

    await runQuestionnaireEngine(
      makeProps({
        conversation: {
          ...makeProps().conversation,
          additionalAttributes: { challenge: { type: "step", data: {} } },
          lastActivityAt: "2026-01-01T00:00:00Z",
          createdAt: "2025-12-31T00:00:00Z",
        } as never,
      }),
    )

    expect(mocks.getSafeSinceTime).toHaveBeenCalledWith(
      new Date("2026-01-01T00:00:00Z"),
      365 * 24 * 60 * 60 * 1000,
    )
    expect(mocks.findLastByConversation).toHaveBeenCalledWith(
      "conversation-1",
      expect.objectContaining({ sinceTime: mocks.safeSinceTime }),
    )
  })

  test("falls back to a concrete sinceTime when safe sinceTime cannot be derived", async () => {
    mocks.getSafeSinceTime.mockReturnValueOnce(undefined)
    mocks.answerCurrent.mockResolvedValue({
      status: "skip",
      reason: "question_missing",
    })

    await runQuestionnaireEngine(
      makeProps({
        conversation: {
          ...makeProps().conversation,
          additionalAttributes: { challenge: { type: "step", data: {} } },
          lastActivityAt: null,
          createdAt: "2026-01-01T00:00:00Z",
        } as never,
      }),
    )

    expect(mocks.findLastByConversation).toHaveBeenCalledWith(
      "conversation-1",
      expect.objectContaining({
        sinceTime: new Date("2025-01-01T00:00:00Z"),
      }),
    )
  })

  test("clears challenge and returns success when the current question is missing", async () => {
    mocks.answerCurrent.mockResolvedValue({
      status: "skip",
      reason: "question_missing",
    })

    const result = await runQuestionnaireEngine(
      makeProps({
        conversation: {
          ...makeProps().conversation,
          additionalAttributes: { challenge: { type: "step", data: {} } },
        },
      }),
    )

    expect(result).toEqual({ status: "success", result: "question_missing" })
    expect(mocks.updateChallenge).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      conversationId: "conversation-1",
      challenge: undefined,
    })
    expect(mocks.chatQueueAdd).not.toHaveBeenCalled()
  })
})
