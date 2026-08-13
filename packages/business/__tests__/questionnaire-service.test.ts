import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const updateBuilder = {
    set: vi.fn(() => updateBuilder),
    where: vi.fn(() => updateBuilder),
    returning: vi.fn(async () => [{ id: "questionnaire-1" }]),
  }
  const insertBuilder = {
    values: vi.fn(() => insertBuilder),
    returning: vi.fn(async () => [{ id: "submission-1" }]),
  }
  const deleteBuilder = {
    where: vi.fn(async () => undefined),
  }
  const conversationUpdateBuilder = {
    set: vi.fn(() => conversationUpdateBuilder),
    where: vi.fn(() => conversationUpdateBuilder),
    returning: vi.fn(async () => [{ id: "conversation-1" }]),
  }
  const tx = {
    query: {
      questionnaireModel: {
        findFirst: vi.fn(async () => ({
          id: "questionnaire-1",
          workspaceId: "workspace-1",
        })),
      },
      questionnaireSubmissionModel: {
        findFirst: vi.fn(async () => null),
      },
      questionnaireQuestionModel: {
        findMany: vi.fn(async () => []),
        findFirst: vi.fn(),
      },
      flowModel: {
        findFirst: vi.fn(async () => ({ id: "flow-1" })),
      },
    },
    update: vi.fn(() => updateBuilder),
    insert: vi.fn(() => insertBuilder),
    delete: vi.fn(() => deleteBuilder),
    execute: vi.fn(async () => undefined),
  }

  return {
    tx,
    updateBuilder,
    insertBuilder,
    deleteBuilder,
    conversationUpdateBuilder,
    questionnaireFindMany: vi.fn(async () => []),
    customFieldFindMany: vi.fn(async () => []),
    transaction: vi.fn(async (callback: (tx: typeof tx) => Promise<void>) =>
      callback(tx),
    ),
  }
})

vi.mock("@chatbotx.io/database/client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/database/client")>()
  return {
    ...actual,
    db: {
      query: {
        questionnaireModel: {
          findMany: mocks.questionnaireFindMany,
          findFirst: vi.fn(),
        },
        customFieldModel: {
          findMany: mocks.customFieldFindMany,
        },
      },
      transaction: mocks.transaction,
      update: vi.fn(() => mocks.conversationUpdateBuilder),
    },
  }
})

vi.mock("@chatbotx.io/redis", () => ({
  withCache: vi.fn((callback) => callback),
  invalidateCacheByTags: vi.fn(async () => undefined),
  createRedisConnection: vi.fn(() => ({ on: vi.fn() })),
}))

vi.mock("../src/contact/service", () => ({
  contactService: {
    setRichSystemFieldByKey: vi.fn(async () => undefined),
  },
  isRichSystemContactField: (fieldName: string) =>
    [
      "phone",
      "phone_number",
      "email",
      "full_name",
      "first_name",
      "last_name",
    ].includes(fieldName),
}))

const { questionnaireService } = await import("../src/questionnaire/service")
const { conversationService } = await import("../src/conversation/service")
const { getQuestionnaireSubmissionListOrder, questionnaireSubmissionService } =
  await import("../src/questionnaire/submission-service")

function collectSqlStrings(
  node: unknown,
  seen = new WeakSet(),
  out: string[] = [],
): string[] {
  if (!node || typeof node !== "object") {
    if (typeof node === "string") {
      out.push(node)
    }
    return out
  }
  if (seen.has(node as object)) {
    return out
  }
  seen.add(node as object)
  if (Array.isArray(node)) {
    if (node.every((item) => typeof item === "string")) {
      out.push(node.join(" "))
      return out
    }
    for (const item of node) {
      collectSqlStrings(item, seen, out)
    }
    return out
  }
  const obj = node as Record<string, unknown>
  for (const [key, value] of Object.entries(obj)) {
    if ((key === "name" || key === "value") && typeof value === "string") {
      out.push(value)
    }
    collectSqlStrings(value, seen, out)
  }
  return out
}

function expectOrderSql(
  sort: Parameters<typeof getQuestionnaireSubmissionListOrder>[0],
  expected: { column: string; direction: "asc" | "desc"; nullsLast?: boolean },
) {
  const sqlText = collectSqlStrings(
    getQuestionnaireSubmissionListOrder(sort),
  ).join(" ")

  expect(sqlText).toContain(expected.column)
  expect(sqlText.toLowerCase()).toContain(expected.direction)
  if (expected.nullsLast) {
    expect(sqlText.toLowerCase()).toContain("nulls last")
  } else {
    expect(sqlText.toLowerCase()).not.toContain("nulls last")
  }
}

describe("questionnaireService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tx.query.questionnaireModel.findFirst.mockResolvedValue({
      id: "questionnaire-1",
      workspaceId: "workspace-1",
    })
    mocks.tx.query.questionnaireSubmissionModel.findFirst.mockResolvedValue(
      null,
    )
    mocks.tx.query.questionnaireQuestionModel.findMany.mockResolvedValue([])
    mocks.tx.query.questionnaireQuestionModel.findFirst.mockResolvedValue(null)
    mocks.updateBuilder.set.mockClear()
    mocks.updateBuilder.where.mockClear()
    mocks.insertBuilder.values.mockClear()
    mocks.insertBuilder.returning.mockResolvedValue([{ id: "submission-1" }])
    mocks.deleteBuilder.where.mockClear()
    mocks.tx.execute.mockClear()
  })

  test("listForFlow does not filter by questionnaire active status", async () => {
    await questionnaireService.listForFlow({
      workspaceId: "workspace-1",
      keyword: "Lead",
    })

    expect(mocks.questionnaireFindMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        deletedAt: { isNull: true },
        name: expect.anything(),
      },
      columns: {
        id: true,
        name: true,
      },
      orderBy: { name: "asc" },
    })
  })

  test("update rejects questionnaires without an active question", async () => {
    await expect(
      questionnaireService.update({
        workspaceId: "workspace-1",
        id: "questionnaire-1",
        triggerFlowId: null,
        enableScore: false,
        enableRetryMessages: false,
        enableCustomFieldMapping: false,
        questions: [
          {
            title: "Email",
            type: "email",
            active: false,
            image: null,
          },
        ],
      }),
    ).rejects.toThrow("Questionnaire requires at least one active question")

    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  test("update saves question active state and normalizes blank image urls", async () => {
    await questionnaireService.update({
      workspaceId: "workspace-1",
      id: "questionnaire-1",
      triggerFlowId: null,
      enableScore: false,
      enableRetryMessages: false,
      enableCustomFieldMapping: false,
      questions: [
        {
          title: "Email",
          type: "email",
          active: true,
          image: { mode: "url", url: "" },
        },
      ],
    })

    expect(mocks.insertBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({
        active: true,
        image: null,
      }),
    )
  })

  test("update stores writable system field mappings separately from custom fields", async () => {
    await questionnaireService.update({
      workspaceId: "workspace-1",
      id: "questionnaire-1",
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

    expect(mocks.insertBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({
        customFieldId: null,
        systemFieldKey: "email",
      }),
    )
  })

  test("update allows custom fields whose types differ from the question type", async () => {
    mocks.customFieldFindMany.mockResolvedValue([
      { id: "123", type: "shortText" },
    ])

    await questionnaireService.update({
      workspaceId: "workspace-1",
      id: "questionnaire-1",
      triggerFlowId: null,
      enableScore: false,
      enableRetryMessages: false,
      enableCustomFieldMapping: true,
      questions: [
        {
          title: "Score",
          type: "number",
          active: true,
          image: null,
          customFieldId: "123",
        },
      ],
    })

    expect(mocks.insertBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({
        customFieldId: "123",
        systemFieldKey: null,
      }),
    )
  })

  test("update rejects missing custom fields", async () => {
    mocks.customFieldFindMany.mockResolvedValue([])

    await expect(
      questionnaireService.update({
        workspaceId: "workspace-1",
        id: "questionnaire-1",
        triggerFlowId: null,
        enableScore: false,
        enableRetryMessages: false,
        enableCustomFieldMapping: true,
        questions: [
          {
            title: "Score",
            type: "number",
            active: true,
            image: null,
            customFieldId: "123",
          },
        ],
      }),
    ).rejects.toThrow("Custom field does not exist in the workspace")
  })

  test("deleteMany soft-deletes questionnaires instead of deleting rows", async () => {
    await questionnaireService.deleteMany({
      workspaceId: "workspace-1",
      ids: ["questionnaire-1"],
    })

    expect(mocks.tx.update).toHaveBeenCalled()
    expect(mocks.updateBuilder.set).toHaveBeenLastCalledWith({
      deletedAt: expect.any(Date),
    })
    expect(mocks.tx.delete).not.toHaveBeenCalled()
  })

  test("update rejects system fields that do not match the question type", async () => {
    await expect(
      questionnaireService.update({
        workspaceId: "workspace-1",
        id: "questionnaire-1",
        triggerFlowId: null,
        enableScore: false,
        enableRetryMessages: false,
        enableCustomFieldMapping: true,
        questions: [
          {
            title: "Score",
            type: "number",
            active: true,
            image: null,
            customFieldId: null,
            systemFieldKey: "email",
          },
        ],
      }),
    ).rejects.toThrow("System field does not match question type")
  })
})

describe("questionnaireSubmissionService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tx.query.questionnaireModel.findFirst.mockResolvedValue({
      id: "questionnaire-1",
      workspaceId: "workspace-1",
      questions: [{ id: "question-1", title: "Question 1" }],
    })
    mocks.tx.query.questionnaireSubmissionModel.findFirst.mockResolvedValue(
      null,
    )
    mocks.tx.query.questionnaireQuestionModel.findMany.mockResolvedValue([])
    mocks.tx.query.questionnaireQuestionModel.findFirst.mockResolvedValue(null)
    mocks.insertBuilder.values.mockClear()
    mocks.insertBuilder.returning.mockResolvedValue([{ id: "submission-1" }])
    mocks.updateBuilder.set.mockClear()
    mocks.updateBuilder.where.mockClear()
    mocks.tx.execute.mockClear()
  })

  test.each([
    ["name", "fullName"],
    ["totalPoints", "totalPoints"],
    ["status", "status"],
  ] as const)("builds questionnaire submission list order for %s asc and desc", (sortId, columnName) => {
    expectOrderSql([{ id: sortId, desc: false }], {
      column: columnName,
      direction: "asc",
    })
    expectOrderSql([{ id: sortId, desc: true }], {
      column: columnName,
      direction: "desc",
    })
  })

  test("builds completedAt sort with nulls last for asc and desc", () => {
    expectOrderSql([{ id: "completedAt", desc: false }], {
      column: "completedAt",
      direction: "asc",
      nullsLast: true,
    })
    expectOrderSql([{ id: "completedAt", desc: true }], {
      column: "completedAt",
      direction: "desc",
      nullsLast: true,
    })
  })

  test("falls back to createdAt desc for empty or invalid submission list sort", () => {
    expectOrderSql([], { column: "createdAt", direction: "desc" })
    expectOrderSql([{ id: "notAllowed", desc: false }], {
      column: "createdAt",
      direction: "desc",
    })
  })

  test("startOrResume skips when the contact already has a submission for the questionnaire", async () => {
    const activeQuestion = { id: "question-1", title: "Active question" }
    const existingSubmission = {
      id: "submission-1",
      questionnaireId: "questionnaire-1",
      contactId: "contact-1",
      status: "completed",
    }
    mocks.tx.query.questionnaireModel.findFirst.mockResolvedValue({
      id: "questionnaire-1",
      workspaceId: "workspace-1",
      questions: [activeQuestion],
    })
    mocks.tx.query.questionnaireSubmissionModel.findFirst.mockResolvedValueOnce(
      existingSubmission,
    )

    await expect(
      questionnaireSubmissionService.startOrResume({
        workspaceId: "workspace-1",
        questionnaireId: "questionnaire-1",
        contactId: "contact-1",
        conversationId: "conversation-1",
      }),
    ).resolves.toEqual({
      status: "skip",
      reason: "questionnaire_already_submitted",
    })

    expect(mocks.insertBuilder.values).not.toHaveBeenCalled()
    expect(mocks.updateBuilder.set).not.toHaveBeenCalled()
  })

  test("startOrResume restarts a cancelled applicant from the first question", async () => {
    const firstQuestion = { id: "question-1", title: "Question 1" }
    const existingSubmission = {
      id: "submission-1",
      questionnaireId: "questionnaire-1",
      contactId: "contact-1",
      conversationId: "conversation-old",
      status: "cancelled",
      currentQuestionId: null,
    }
    const restartedSubmission = {
      ...existingSubmission,
      conversationId: "conversation-new",
      status: "inProgress",
      currentQuestionId: "question-1",
    }
    mocks.tx.query.questionnaireModel.findFirst.mockResolvedValue({
      id: "questionnaire-1",
      workspaceId: "workspace-1",
      enableScore: true,
      questions: [firstQuestion],
    })
    mocks.tx.query.questionnaireSubmissionModel.findFirst.mockResolvedValueOnce(
      existingSubmission,
    )
    mocks.updateBuilder.returning.mockResolvedValueOnce([restartedSubmission])

    await expect(
      questionnaireSubmissionService.startOrResume({
        workspaceId: "workspace-1",
        questionnaireId: "questionnaire-1",
        contactId: "contact-1",
        conversationId: "conversation-new",
      }),
    ).resolves.toMatchObject({
      status: "wait",
      submission: restartedSubmission,
      question: firstQuestion,
    })

    expect(mocks.tx.delete).toHaveBeenCalled()
    expect(mocks.deleteBuilder.where).toHaveBeenCalled()
    expect(mocks.updateBuilder.set).toHaveBeenCalledWith({
      conversationId: "conversation-new",
      status: "inProgress",
      totalPoints: 0,
      currentQuestionId: "question-1",
      currentQuestionSentAt: expect.any(Date),
      lastAnsweredMessageId: null,
      startedAt: expect.any(Date),
      completedAt: null,
      cancelledAt: null,
    })
    expect(mocks.insertBuilder.values).not.toHaveBeenCalled()
  })

  test("startOrResume reassigns active same-questionnaire submission to current conversation", async () => {
    const activeQuestion = { id: "question-1", title: "Question 1" }
    const currentQuestion = { id: "question-2", title: "Question 2" }
    const existingSubmission = {
      id: "submission-1",
      questionnaireId: "questionnaire-1",
      contactId: "contact-1",
      conversationId: "conversation-old",
      status: "inProgress",
      currentQuestionId: "question-2",
    }
    const reassignedSubmission = {
      ...existingSubmission,
      conversationId: "conversation-new",
    }
    mocks.tx.query.questionnaireModel.findFirst.mockResolvedValue({
      id: "questionnaire-1",
      workspaceId: "workspace-1",
      questions: [activeQuestion, currentQuestion],
    })
    mocks.tx.query.questionnaireSubmissionModel.findFirst.mockResolvedValueOnce(
      existingSubmission,
    )
    mocks.updateBuilder.returning.mockResolvedValueOnce([reassignedSubmission])

    await expect(
      questionnaireSubmissionService.startOrResume({
        workspaceId: "workspace-1",
        questionnaireId: "questionnaire-1",
        contactId: "contact-1",
        conversationId: "conversation-new",
      }),
    ).resolves.toMatchObject({
      status: "wait",
      submission: reassignedSubmission,
      question: currentQuestion,
    })

    expect(mocks.updateBuilder.set).toHaveBeenCalledWith({
      conversationId: "conversation-new",
    })
    expect(mocks.updateBuilder.where).toHaveBeenCalled()
    expect(mocks.updateBuilder.returning).toHaveBeenCalled()
    expect(mocks.insertBuilder.values).not.toHaveBeenCalled()
  })

  test("startOrResume resumes active same-questionnaire submission without update when conversation is unchanged", async () => {
    const currentQuestion = { id: "question-2", title: "Question 2" }
    const existingSubmission = {
      id: "submission-1",
      questionnaireId: "questionnaire-1",
      contactId: "contact-1",
      conversationId: "conversation-1",
      status: "inProgress",
      currentQuestionId: "question-2",
    }
    mocks.tx.query.questionnaireModel.findFirst.mockResolvedValue({
      id: "questionnaire-1",
      workspaceId: "workspace-1",
      questions: [{ id: "question-1", title: "Question 1" }, currentQuestion],
    })
    mocks.tx.query.questionnaireSubmissionModel.findFirst.mockResolvedValueOnce(
      existingSubmission,
    )

    await expect(
      questionnaireSubmissionService.startOrResume({
        workspaceId: "workspace-1",
        questionnaireId: "questionnaire-1",
        contactId: "contact-1",
        conversationId: "conversation-1",
      }),
    ).resolves.toMatchObject({
      status: "wait",
      submission: existingSubmission,
      question: currentQuestion,
    })

    expect(mocks.updateBuilder.set).not.toHaveBeenCalled()
    expect(mocks.insertBuilder.values).not.toHaveBeenCalled()
  })

  test("startOrResume skips active same-questionnaire submission when the current question is missing", async () => {
    mocks.tx.query.questionnaireModel.findFirst.mockResolvedValue({
      id: "questionnaire-1",
      workspaceId: "workspace-1",
      questions: [{ id: "question-1", title: "Question 1" }],
    })
    mocks.tx.query.questionnaireSubmissionModel.findFirst.mockResolvedValueOnce(
      {
        id: "submission-1",
        questionnaireId: "questionnaire-1",
        contactId: "contact-1",
        conversationId: "conversation-1",
        status: "inProgress",
        currentQuestionId: "question-2",
      },
    )

    await expect(
      questionnaireSubmissionService.startOrResume({
        workspaceId: "workspace-1",
        questionnaireId: "questionnaire-1",
        contactId: "contact-1",
        conversationId: "conversation-1",
      }),
    ).resolves.toEqual({
      status: "skip",
      reason: "questionnaire_current_question_missing",
    })

    expect(mocks.updateBuilder.set).not.toHaveBeenCalled()
    expect(mocks.insertBuilder.values).not.toHaveBeenCalled()
  })

  test("startOrResume creates the first submission when the contact has no applicant record", async () => {
    const activeQuestion = { id: "question-1", title: "Active question" }
    mocks.tx.query.questionnaireModel.findFirst.mockResolvedValue({
      id: "questionnaire-1",
      workspaceId: "workspace-1",
      enableScore: false,
      questions: [activeQuestion],
    })
    mocks.tx.query.questionnaireSubmissionModel.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)

    const result = await questionnaireSubmissionService.startOrResume({
      workspaceId: "workspace-1",
      questionnaireId: "questionnaire-1",
      contactId: "contact-1",
      conversationId: "conversation-1",
    })

    expect(mocks.tx.query.questionnaireModel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        with: {
          questions: {
            where: { active: true, deletedAt: { isNull: true } },
            orderBy: { orderNo: "asc" },
          },
        },
      }),
    )
    expect(result).toMatchObject({
      status: "wait",
      question: activeQuestion,
    })
    expect(mocks.insertBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({
        questionnaireId: "questionnaire-1",
        contactId: "contact-1",
        conversationId: "conversation-1",
        status: "inProgress",
      }),
    )
  })

  test("startOrResume skips when the contact has another active questionnaire", async () => {
    mocks.tx.query.questionnaireModel.findFirst.mockResolvedValue({
      id: "questionnaire-1",
      workspaceId: "workspace-1",
      questions: [{ id: "question-1" }],
    })
    mocks.tx.query.questionnaireSubmissionModel.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "submission-1",
        questionnaireId: "questionnaire-2",
        currentQuestionId: "question-2",
      })

    await expect(
      questionnaireSubmissionService.startOrResume({
        workspaceId: "workspace-1",
        questionnaireId: "questionnaire-1",
        contactId: "contact-1",
        conversationId: "conversation-1",
      }),
    ).resolves.toEqual({
      status: "skip",
      reason: "contact_has_other_active_questionnaire",
    })
  })

  test("answerCurrent locks the active submission before reading typed state", async () => {
    mocks.tx.query.questionnaireSubmissionModel.findFirst.mockResolvedValue(
      null,
    )

    await questionnaireSubmissionService.answerCurrent({
      workspaceId: "workspace-1",
      questionnaireId: "questionnaire-1",
      contactId: "contact-1",
      conversationId: "conversation-1",
      rawText: "hello",
      attempts: 0,
    })

    expect(mocks.tx.execute).toHaveBeenCalled()
    expect(
      mocks.tx.query.questionnaireSubmissionModel.findFirst,
    ).toHaveBeenCalled()
  })

  test("answerCurrent treats repeated trigger messages as already processed", async () => {
    const sentAt = new Date("2026-01-03T00:00:00Z")
    const currentQuestion = {
      id: "question-2",
      questionnaireId: "questionnaire-1",
      type: "text",
      title: "Next question",
    }
    mocks.tx.query.questionnaireSubmissionModel.findFirst.mockResolvedValue({
      id: "submission-1",
      currentQuestionId: "question-2",
      currentQuestionSentAt: sentAt,
      lastAnsweredMessageId: "message-1",
    })
    mocks.tx.query.questionnaireQuestionModel.findFirst.mockResolvedValue(
      currentQuestion,
    )

    await expect(
      questionnaireSubmissionService.answerCurrent({
        workspaceId: "workspace-1",
        questionnaireId: "questionnaire-1",
        contactId: "contact-1",
        conversationId: "conversation-1",
        rawText: "should not be applied again",
        attempts: 0,
        triggerMessageId: "message-1",
      }),
    ).resolves.toEqual({
      status: "wait",
      submissionId: "submission-1",
      question: currentQuestion,
      sentAt,
    })

    expect(mocks.tx.insert).not.toHaveBeenCalled()
    expect(mocks.tx.query.questionnaireModel.findFirst).not.toHaveBeenCalled()
  })

  test("answerCurrent rejects overlong free-text answers", async () => {
    mocks.tx.query.questionnaireSubmissionModel.findFirst.mockResolvedValue({
      id: "submission-1",
      currentQuestionId: "question-1",
    })
    mocks.tx.query.questionnaireModel.findFirst.mockResolvedValue({
      id: "questionnaire-1",
      enableScore: false,
      enableCustomFieldMapping: false,
    })
    mocks.tx.query.questionnaireQuestionModel.findFirst = vi.fn(async () => ({
      id: "question-1",
      questionnaireId: "questionnaire-1",
      type: "text",
      title: "Tell us more",
      retryMessage: "Too long",
      customField: null,
    }))

    await expect(
      questionnaireSubmissionService.answerCurrent({
        workspaceId: "workspace-1",
        questionnaireId: "questionnaire-1",
        contactId: "contact-1",
        conversationId: "conversation-1",
        rawText: "x".repeat(1001),
        attempts: 0,
      }),
    ).resolves.toMatchObject({
      status: "retry",
      submissionId: "submission-1",
      question: expect.objectContaining({ id: "question-1" }),
      attempts: 1,
      retryMessage: "Too long",
      reason: "too_long",
    })
  })

  test("answerCurrent advances to the next question after max invalid attempts", async () => {
    const currentQuestion = {
      id: "question-1",
      questionnaireId: "questionnaire-1",
      type: "email",
      title: "Email",
      retryMessage: "Invalid email",
      customField: null,
    }
    const nextQuestion = {
      id: "question-2",
      questionnaireId: "questionnaire-1",
      type: "text",
      title: "Name",
      customField: null,
    }
    mocks.tx.query.questionnaireSubmissionModel.findFirst.mockResolvedValue({
      id: "submission-1",
      currentQuestionId: "question-1",
    })
    mocks.tx.query.questionnaireModel.findFirst.mockResolvedValue({
      id: "questionnaire-1",
      enableScore: false,
      enableCustomFieldMapping: false,
      triggerFlowId: "flow-1",
    })
    mocks.tx.query.questionnaireQuestionModel.findFirst.mockResolvedValue(
      currentQuestion,
    )
    mocks.tx.query.questionnaireQuestionModel.findMany.mockResolvedValue([
      currentQuestion,
      nextQuestion,
    ])

    await expect(
      questionnaireSubmissionService.answerCurrent({
        workspaceId: "workspace-1",
        questionnaireId: "questionnaire-1",
        contactId: "contact-1",
        conversationId: "conversation-1",
        rawText: "not-an-email",
        attempts: 2,
        triggerMessageId: "message-1",
      }),
    ).resolves.toMatchObject({
      status: "wait",
      submissionId: "submission-1",
      question: nextQuestion,
      sentAt: expect.any(Date),
    })

    expect(mocks.updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        currentQuestionId: "question-2",
        currentQuestionSentAt: expect.any(Date),
        lastAnsweredMessageId: "message-1",
      }),
    )
    expect(mocks.updateBuilder.set).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "cancelled" }),
    )
  })

  test("answerCurrent completes the submission when max invalid attempts happen on the last question", async () => {
    const currentQuestion = {
      id: "question-1",
      questionnaireId: "questionnaire-1",
      type: "email",
      title: "Email",
      retryMessage: "Invalid email",
      customField: null,
    }
    mocks.tx.query.questionnaireSubmissionModel.findFirst.mockResolvedValue({
      id: "submission-1",
      currentQuestionId: "question-1",
    })
    mocks.tx.query.questionnaireModel.findFirst.mockResolvedValue({
      id: "questionnaire-1",
      enableScore: false,
      enableCustomFieldMapping: false,
      triggerFlowId: "flow-1",
    })
    mocks.tx.query.questionnaireQuestionModel.findFirst.mockResolvedValue(
      currentQuestion,
    )
    mocks.tx.query.questionnaireQuestionModel.findMany.mockResolvedValue([
      currentQuestion,
    ])

    await expect(
      questionnaireSubmissionService.answerCurrent({
        workspaceId: "workspace-1",
        questionnaireId: "questionnaire-1",
        contactId: "contact-1",
        conversationId: "conversation-1",
        rawText: "not-an-email",
        attempts: 2,
        triggerMessageId: "message-1",
      }),
    ).resolves.toEqual({
      status: "completed",
      submissionId: "submission-1",
      triggerFlowId: "flow-1",
    })

    expect(mocks.updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        completedAt: expect.any(Date),
        currentQuestionId: null,
        currentQuestionSentAt: null,
        lastAnsweredMessageId: "message-1",
      }),
    )
  })
})

describe("conversationService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.conversationUpdateBuilder.returning.mockResolvedValue([
      { id: "conversation-1" },
    ])
  })

  test("updateChallenge updates only the challenge key in additionalAttributes", async () => {
    await conversationService.updateChallenge({
      workspaceId: "workspace-1",
      conversationId: "conversation-1",
      challenge: {
        type: "step",
        data: {
          flowId: "flow-1",
          nodeId: "node-1",
          stepId: "step-1",
          attempts: 0,
          lastAttemptAt: new Date("2026-01-01T00:00:00Z"),
        },
      },
    })

    expect(mocks.conversationUpdateBuilder.set).toHaveBeenCalledWith({
      additionalAttributes: expect.anything(),
    })
    expect(mocks.conversationUpdateBuilder.returning).toHaveBeenCalled()
  })

  test("updateChallenge throws when conversation update matches no rows", async () => {
    mocks.conversationUpdateBuilder.returning.mockResolvedValueOnce([])

    await expect(
      conversationService.updateChallenge({
        workspaceId: "workspace-1",
        conversationId: "missing",
        challenge: undefined,
      }),
    ).rejects.toThrow("Conversation not found")
  })
})
