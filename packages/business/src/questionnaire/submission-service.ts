import {
  and,
  asc,
  count,
  type DatabaseClient,
  db,
  desc,
  eq,
  ilike,
  inArray,
  isUniqueViolationError,
  sql,
  sum,
} from "@chatbotx.io/database/client"
import type {
  QuestionnaireAnswerValue,
  QuestionnaireChoiceOption,
} from "@chatbotx.io/database/schema"
import {
  contactModel,
  questionnaireAnswerModel,
  type questionnaireQuestionModel,
  questionnaireSubmissionModel,
} from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  likeContains,
} from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { contactService, isRichSystemContactField } from "../contact/service"
import { contactCustomFieldService } from "../contact-custom-field/service"
import { notFoundException } from "../errors"
import { questionnaireService } from "./service"

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const phoneRegex = /^\+?(\d[\d-. ]+)?(\([\d-. ]+\))?[\d-. ]+\d$/
const MAX_INVALID_ATTEMPTS = 3
const MAX_ANSWER_TEXT_LENGTH = 1000
type QuestionnaireSubmissionListSort = { id: string; desc: boolean }[]

export function getQuestionnaireSubmissionListOrder(
  sort?: QuestionnaireSubmissionListSort,
) {
  const activeSort = sort?.[0]
  if (!activeSort) {
    return desc(questionnaireSubmissionModel.createdAt)
  }

  switch (activeSort.id) {
    case "name":
      return activeSort.desc
        ? desc(contactModel.fullName)
        : asc(contactModel.fullName)
    case "totalPoints":
      return activeSort.desc
        ? desc(questionnaireSubmissionModel.totalPoints)
        : asc(questionnaireSubmissionModel.totalPoints)
    case "status":
      return activeSort.desc
        ? desc(questionnaireSubmissionModel.status)
        : asc(questionnaireSubmissionModel.status)
    case "completedAt":
      return activeSort.desc
        ? sql`${questionnaireSubmissionModel.completedAt} desc nulls last`
        : sql`${questionnaireSubmissionModel.completedAt} asc nulls last`
    default:
      return desc(questionnaireSubmissionModel.createdAt)
  }
}

class QuestionnaireSubmissionService extends BaseService {
  async list(input: {
    workspaceId: string
    questionnaireId: string
    page?: number
    perPage?: number
    name?: string
    sort?: QuestionnaireSubmissionListSort
  }) {
    const questionnaire = await questionnaireService.findByOrFail({
      workspaceId: input.workspaceId,
      id: input.questionnaireId,
    })
    const pagination = getPaginationWithDefaults({
      page: input.page,
      perPage: input.perPage ?? 10,
    })
    const whereSQL = and(
      eq(questionnaireSubmissionModel.workspaceId, input.workspaceId),
      eq(questionnaireSubmissionModel.questionnaireId, input.questionnaireId),
      input.name
        ? ilike(contactModel.fullName, likeContains(input.name))
        : undefined,
    )
    const [rows, totalRows] = await Promise.all([
      db
        .select({
          id: questionnaireSubmissionModel.id,
          status: questionnaireSubmissionModel.status,
          totalPoints: questionnaireSubmissionModel.totalPoints,
          completedAt: questionnaireSubmissionModel.completedAt,
          conversationId: questionnaireSubmissionModel.conversationId,
          contact: {
            id: contactModel.id,
            fullName: contactModel.fullName,
            firstName: contactModel.firstName,
            lastName: contactModel.lastName,
            email: contactModel.email,
            phoneNumber: contactModel.phoneNumber,
            avatar: contactModel.avatar,
          },
        })
        .from(questionnaireSubmissionModel)
        .innerJoin(
          contactModel,
          eq(questionnaireSubmissionModel.contactId, contactModel.id),
        )
        .where(whereSQL)
        .orderBy(getQuestionnaireSubmissionListOrder(input.sort))
        .limit(pagination.limit)
        .offset(pagination.offset),
      db
        .select({ value: count() })
        .from(questionnaireSubmissionModel)
        .innerJoin(
          contactModel,
          eq(questionnaireSubmissionModel.contactId, contactModel.id),
        )
        .where(whereSQL)
        .then((rows) => Number(rows[0]?.value ?? 0)),
    ])

    return {
      enableScore: questionnaire.enableScore,
      data: rows,
      pageCount: Math.ceil(totalRows / (input.perPage ?? 10)),
    }
  }

  async dashboard(input: { workspaceId: string; questionnaireId: string }) {
    await questionnaireService.findByOrFail({
      workspaceId: input.workspaceId,
      id: input.questionnaireId,
    })
    const [row] = await db
      .select({
        totalApplicants: count(),
        completed: count(
          sql`CASE WHEN ${questionnaireSubmissionModel.status} = 'completed' THEN 1 END`,
        ),
      })
      .from(questionnaireSubmissionModel)
      .where(
        and(
          eq(questionnaireSubmissionModel.workspaceId, input.workspaceId),
          eq(
            questionnaireSubmissionModel.questionnaireId,
            input.questionnaireId,
          ),
        ),
      )
    const totalApplicants = Number(row?.totalApplicants ?? 0)
    const completed = Number(row?.completed ?? 0)
    return {
      totalApplicants,
      completed,
      completionRate:
        totalApplicants === 0
          ? 0
          : Math.round((completed / totalApplicants) * 100),
    }
  }

  async detail(input: {
    workspaceId: string
    questionnaireId: string
    submissionId: string
  }) {
    const submission = await db.query.questionnaireSubmissionModel.findFirst({
      where: {
        id: input.submissionId,
        workspaceId: input.workspaceId,
        questionnaireId: input.questionnaireId,
      },
      with: {
        contact: true,
        answers: {
          orderBy: { createdAt: "asc" },
        },
      },
    })
    if (!submission) {
      throw notFoundException("Submission not found")
    }
    return {
      id: submission.id,
      contact: submission.contact,
      conversationId: submission.conversationId,
      status: submission.status,
      totalPoints: submission.totalPoints,
      answers: submission.answers.map((answer) => ({
        questionId: answer.questionIdSnapshot,
        label: answer.labelSnapshot,
        value: answer.value,
        pointsEarned: answer.pointsEarned,
      })),
    }
  }

  async startOrResume(input: {
    workspaceId: string
    questionnaireId: string
    contactId: string
    conversationId?: string | null
  }) {
    return await db.transaction(async (tx) => {
      const questionnaire = await tx.query.questionnaireModel.findFirst({
        where: {
          id: input.questionnaireId,
          workspaceId: input.workspaceId,
          deletedAt: { isNull: true },
        },
        with: {
          questions: {
            where: { active: true, deletedAt: { isNull: true } },
            orderBy: { orderNo: "asc" },
          },
        },
      })
      if (!questionnaire) {
        return {
          status: "skip" as const,
          reason: "questionnaire_not_available",
        }
      }
      if (questionnaire.questions.length === 0) {
        return { status: "skip" as const, reason: "questionnaire_empty" }
      }
      const firstQuestion = questionnaire.questions[0]

      const existingForQuestionnaire =
        await tx.query.questionnaireSubmissionModel.findFirst({
          where: {
            workspaceId: input.workspaceId,
            questionnaireId: input.questionnaireId,
            contactId: input.contactId,
          },
        })
      if (existingForQuestionnaire) {
        if (existingForQuestionnaire.status === "cancelled") {
          const sentAt = new Date()
          await tx
            .delete(questionnaireAnswerModel)
            .where(
              eq(
                questionnaireAnswerModel.submissionId,
                existingForQuestionnaire.id,
              ),
            )

          const [restartedSubmission] = await tx
            .update(questionnaireSubmissionModel)
            .set({
              conversationId: input.conversationId ?? null,
              status: "inProgress",
              totalPoints: questionnaire.enableScore ? 0 : null,
              currentQuestionId: firstQuestion.id,
              currentQuestionSentAt: sentAt,
              lastAnsweredMessageId: null,
              startedAt: sentAt,
              completedAt: null,
              cancelledAt: null,
            })
            .where(
              and(
                eq(
                  questionnaireSubmissionModel.id,
                  existingForQuestionnaire.id,
                ),
                eq(questionnaireSubmissionModel.workspaceId, input.workspaceId),
                eq(questionnaireSubmissionModel.status, "cancelled"),
              ),
            )
            .returning()

          return {
            status: "wait" as const,
            questionnaire,
            submission: restartedSubmission,
            question: firstQuestion,
          }
        }

        if (existingForQuestionnaire.status !== "inProgress") {
          return {
            status: "skip" as const,
            reason: "questionnaire_already_submitted",
          }
        }

        const currentQuestion = questionnaire.questions.find(
          (question) =>
            question.id === existingForQuestionnaire.currentQuestionId,
        )
        if (!currentQuestion) {
          return {
            status: "skip" as const,
            reason: "questionnaire_current_question_missing",
          }
        }

        if (
          existingForQuestionnaire.conversationId !==
          (input.conversationId ?? null)
        ) {
          const [resumedSubmission] = await tx
            .update(questionnaireSubmissionModel)
            .set({ conversationId: input.conversationId ?? null })
            .where(
              and(
                eq(
                  questionnaireSubmissionModel.id,
                  existingForQuestionnaire.id,
                ),
                eq(questionnaireSubmissionModel.workspaceId, input.workspaceId),
                eq(questionnaireSubmissionModel.status, "inProgress"),
              ),
            )
            .returning()

          return {
            status: "wait" as const,
            questionnaire,
            submission: resumedSubmission,
            question: currentQuestion,
          }
        }

        return {
          status: "wait" as const,
          questionnaire,
          submission: existingForQuestionnaire,
          question: currentQuestion,
        }
      }

      const existing = await tx.query.questionnaireSubmissionModel.findFirst({
        where: {
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          status: "inProgress",
        },
      })
      if (existing) {
        if (existing.questionnaireId === input.questionnaireId) {
          return {
            status: "skip" as const,
            reason: "questionnaire_already_submitted",
          }
        }
        return {
          status: "skip" as const,
          reason: "contact_has_other_active_questionnaire",
        }
      }

      const submissionId = createId()
      let submission: typeof questionnaireSubmissionModel.$inferSelect
      try {
        ;[submission] = await tx
          .insert(questionnaireSubmissionModel)
          .values({
            id: submissionId,
            workspaceId: input.workspaceId,
            questionnaireId: input.questionnaireId,
            contactId: input.contactId,
            conversationId: input.conversationId ?? null,
            status: "inProgress",
            totalPoints: questionnaire.enableScore ? 0 : null,
            currentQuestionId: firstQuestion.id,
            currentQuestionSentAt: new Date(),
          })
          .returning()
      } catch (error) {
        if (isUniqueViolationError(error)) {
          return {
            status: "skip" as const,
            reason: "already_has_active_submission",
          }
        }
        throw error
      }

      return {
        status: "wait" as const,
        questionnaire,
        submission,
        question: firstQuestion,
      }
    })
  }

  async markQuestionSent(input: {
    workspaceId: string
    submissionId: string
    questionId: string
    sentAt: Date
  }) {
    await db
      .update(questionnaireSubmissionModel)
      .set({
        currentQuestionId: input.questionId,
        currentQuestionSentAt: input.sentAt,
      })
      .where(
        and(
          eq(questionnaireSubmissionModel.id, input.submissionId),
          eq(questionnaireSubmissionModel.workspaceId, input.workspaceId),
          eq(questionnaireSubmissionModel.status, "inProgress"),
        ),
      )
  }

  async answerCurrent(input: {
    workspaceId: string
    contactId: string
    conversationId: string
    questionnaireId: string
    rawText: string
    attempts: number
    triggerMessageId?: string
  }) {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`
        SELECT 1
        FROM ${questionnaireSubmissionModel}
        WHERE ${questionnaireSubmissionModel.workspaceId} = ${input.workspaceId}
          AND ${questionnaireSubmissionModel.contactId} = ${input.contactId}
          AND ${questionnaireSubmissionModel.conversationId} = ${input.conversationId}
          AND ${questionnaireSubmissionModel.questionnaireId} = ${input.questionnaireId}
          AND ${questionnaireSubmissionModel.status} = 'inProgress'
        FOR UPDATE
      `)

      const submission = await tx.query.questionnaireSubmissionModel.findFirst({
        where: {
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          conversationId: input.conversationId,
          questionnaireId: input.questionnaireId,
          status: "inProgress",
        },
      })
      if (!submission?.currentQuestionId) {
        return { status: "skip" as const, reason: "submission_not_found" }
      }
      if (
        input.triggerMessageId &&
        submission.lastAnsweredMessageId === input.triggerMessageId
      ) {
        const question = await tx.query.questionnaireQuestionModel.findFirst({
          where: {
            id: submission.currentQuestionId,
            questionnaireId: input.questionnaireId,
            deletedAt: { isNull: true },
          },
        })
        return question
          ? {
              status: "wait" as const,
              submissionId: submission.id,
              question,
              sentAt: submission.currentQuestionSentAt ?? new Date(),
            }
          : { status: "skip" as const, reason: "question_missing" }
      }
      const questionnaire = await tx.query.questionnaireModel.findFirst({
        where: {
          id: input.questionnaireId,
          workspaceId: input.workspaceId,
          deletedAt: { isNull: true },
        },
      })
      const question = await tx.query.questionnaireQuestionModel.findFirst({
        where: {
          id: submission.currentQuestionId,
          questionnaireId: input.questionnaireId,
          deletedAt: { isNull: true },
        },
        with: { customField: true },
      })
      if (!(questionnaire && question)) {
        await this.cancel(
          {
            workspaceId: input.workspaceId,
            questionnaireId: input.questionnaireId,
            contactId: input.contactId,
          },
          tx,
        )
        return { status: "skip" as const, reason: "question_missing" }
      }

      const parsed = this.parseAnswer(question, input.rawText)
      if (!parsed.valid) {
        const nextAttempts = input.attempts + 1
        if (nextAttempts >= MAX_INVALID_ATTEMPTS) {
          const questions = await tx.query.questionnaireQuestionModel.findMany({
            where: {
              questionnaireId: input.questionnaireId,
              active: true,
              deletedAt: { isNull: true },
            },
            orderBy: { orderNo: "asc" },
          })
          const currentIndex = questions.findIndex(
            (item) => item.id === question.id,
          )
          const nextQuestion = questions[currentIndex + 1]

          if (!nextQuestion) {
            await tx
              .update(questionnaireSubmissionModel)
              .set({
                status: "completed",
                completedAt: new Date(),
                currentQuestionId: null,
                currentQuestionSentAt: null,
                lastAnsweredMessageId: input.triggerMessageId ?? null,
              })
              .where(eq(questionnaireSubmissionModel.id, submission.id))
            return {
              status: "completed" as const,
              submissionId: submission.id,
              triggerFlowId: questionnaire.triggerFlowId,
            }
          }

          const sentAt = new Date()
          await tx
            .update(questionnaireSubmissionModel)
            .set({
              currentQuestionId: nextQuestion.id,
              currentQuestionSentAt: sentAt,
              lastAnsweredMessageId: input.triggerMessageId ?? null,
            })
            .where(eq(questionnaireSubmissionModel.id, submission.id))
          return {
            status: "wait" as const,
            submissionId: submission.id,
            question: nextQuestion,
            sentAt,
          }
        }
        return {
          status: "retry" as const,
          submissionId: submission.id,
          question,
          attempts: nextAttempts,
          retryMessage: question.retryMessage,
          reason: parsed.reason,
        }
      }

      const pointsEarned = questionnaire.enableScore
        ? this.calculatePoints(question, parsed.value)
        : null
      const labelSnapshot = question.customField?.name ?? question.title
      await tx
        .insert(questionnaireAnswerModel)
        .values({
          id: createId(),
          submissionId: submission.id,
          questionId: question.id,
          questionIdSnapshot: question.id,
          questionTitleSnapshot: question.title,
          questionTypeSnapshot: question.type,
          labelSnapshot,
          value: parsed.value,
          pointsEarned,
          answeredAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            questionnaireAnswerModel.submissionId,
            questionnaireAnswerModel.questionIdSnapshot,
          ],
          set: {
            value: parsed.value,
            pointsEarned,
            labelSnapshot,
            questionTitleSnapshot: question.title,
            questionTypeSnapshot: question.type,
            answeredAt: new Date(),
            attemptCount: sql`${questionnaireAnswerModel.attemptCount} + 1`,
          },
        })

      if (questionnaire.enableCustomFieldMapping && question.customFieldId) {
        await contactCustomFieldService.setValues(
          {
            workspaceId: input.workspaceId,
            contactId: input.contactId,
            fields: [
              {
                customFieldId: question.customFieldId,
                value: this.answerValueToString(parsed.value),
              },
            ],
          },
          tx,
        )
      }
      if (
        questionnaire.enableCustomFieldMapping &&
        question.systemFieldKey &&
        isRichSystemContactField(question.systemFieldKey)
      ) {
        await contactService.setRichSystemFieldByKey({
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          fieldName: question.systemFieldKey,
          value: this.answerValueToString(parsed.value),
          tx,
        })
      }

      const questions = await tx.query.questionnaireQuestionModel.findMany({
        where: {
          questionnaireId: input.questionnaireId,
          active: true,
          deletedAt: { isNull: true },
        },
        orderBy: { orderNo: "asc" },
      })
      const currentIndex = questions.findIndex(
        (item) => item.id === question.id,
      )
      const nextQuestion = questions[currentIndex + 1]
      const totalPoints = questionnaire.enableScore
        ? await tx
            .select({ value: sum(questionnaireAnswerModel.pointsEarned) })
            .from(questionnaireAnswerModel)
            .where(eq(questionnaireAnswerModel.submissionId, submission.id))
            .then((rows) => Number(rows[0]?.value ?? 0))
        : null

      if (!nextQuestion) {
        await tx
          .update(questionnaireSubmissionModel)
          .set({
            status: "completed",
            totalPoints,
            completedAt: new Date(),
            currentQuestionId: null,
            currentQuestionSentAt: null,
            lastAnsweredMessageId: input.triggerMessageId ?? null,
          })
          .where(eq(questionnaireSubmissionModel.id, submission.id))
        return {
          status: "completed" as const,
          submissionId: submission.id,
          triggerFlowId: questionnaire.triggerFlowId,
        }
      }

      const sentAt = new Date()
      await tx
        .update(questionnaireSubmissionModel)
        .set({
          totalPoints,
          currentQuestionId: nextQuestion.id,
          currentQuestionSentAt: sentAt,
          lastAnsweredMessageId: input.triggerMessageId ?? null,
        })
        .where(eq(questionnaireSubmissionModel.id, submission.id))
      return {
        status: "wait" as const,
        submissionId: submission.id,
        question: nextQuestion,
        sentAt,
      }
    })
  }

  async cancel(
    input: {
      workspaceId: string
      questionnaireId: string
      contactId: string
    },
    tx: DatabaseClient = db,
  ) {
    await tx
      .update(questionnaireSubmissionModel)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        currentQuestionId: null,
        currentQuestionSentAt: null,
      })
      .where(
        and(
          eq(questionnaireSubmissionModel.workspaceId, input.workspaceId),
          eq(
            questionnaireSubmissionModel.questionnaireId,
            input.questionnaireId,
          ),
          eq(questionnaireSubmissionModel.contactId, input.contactId),
          eq(questionnaireSubmissionModel.status, "inProgress"),
        ),
      )
  }

  async deleteApplicant(input: {
    workspaceId: string
    questionnaireId: string
    contactId: string
  }) {
    await db
      .delete(questionnaireSubmissionModel)
      .where(
        and(
          eq(questionnaireSubmissionModel.workspaceId, input.workspaceId),
          eq(
            questionnaireSubmissionModel.questionnaireId,
            input.questionnaireId,
          ),
          eq(questionnaireSubmissionModel.contactId, input.contactId),
        ),
      )
  }

  async deleteSubmission(input: {
    workspaceId: string
    questionnaireId: string
    submissionId: string
  }) {
    await db
      .delete(questionnaireSubmissionModel)
      .where(
        and(
          eq(questionnaireSubmissionModel.workspaceId, input.workspaceId),
          eq(
            questionnaireSubmissionModel.questionnaireId,
            input.questionnaireId,
          ),
          eq(questionnaireSubmissionModel.id, input.submissionId),
        ),
      )
  }

  async deleteSubmissions(input: {
    workspaceId: string
    questionnaireId: string
    submissionIds: string[]
  }) {
    if (input.submissionIds.length === 0) {
      return
    }
    await db
      .delete(questionnaireSubmissionModel)
      .where(
        and(
          eq(questionnaireSubmissionModel.workspaceId, input.workspaceId),
          eq(
            questionnaireSubmissionModel.questionnaireId,
            input.questionnaireId,
          ),
          inArray(questionnaireSubmissionModel.id, input.submissionIds),
        ),
      )
  }

  private parseAnswer(
    question: typeof questionnaireQuestionModel.$inferSelect,
    rawText: string,
  ):
    | { valid: true; value: QuestionnaireAnswerValue }
    | { valid: false; reason: string } {
    const value = rawText.trim()
    if (!value) {
      return { valid: false, reason: "empty" }
    }
    switch (question.type) {
      case "number": {
        const numberValue = Number(value)
        return Number.isFinite(numberValue)
          ? { valid: true, value: numberValue }
          : { valid: false, reason: "invalid_number" }
      }
      case "email":
        return emailPattern.test(value)
          ? { valid: true, value }
          : { valid: false, reason: "invalid_email" }
      case "phone":
        return phoneRegex.test(value)
          ? { valid: true, value }
          : { valid: false, reason: "invalid_phone" }
      case "multipleChoice": {
        const option = (question.config?.options ?? []).find(
          (item) => item.id === value || item.label === value,
        )
        return option
          ? { valid: true, value: { optionId: option.id, label: option.label } }
          : { valid: false, reason: "invalid_option" }
      }
      default:
        if (value.length > MAX_ANSWER_TEXT_LENGTH) {
          return { valid: false, reason: "too_long" }
        }
        return { valid: true, value }
    }
  }

  private calculatePoints(
    question: typeof questionnaireQuestionModel.$inferSelect,
    value: QuestionnaireAnswerValue,
  ) {
    if (question.type !== "multipleChoice") {
      return question.point
    }
    const optionId =
      typeof value === "object" && value !== null && "optionId" in value
        ? value.optionId
        : null
    const option = (question.config?.options ?? []).find(
      (item: QuestionnaireChoiceOption) => item.id === optionId,
    )
    return option?.points ?? 0
  }

  private answerValueToString(value: QuestionnaireAnswerValue) {
    if (value === null) {
      return ""
    }
    if (typeof value === "object") {
      return value.label
    }
    return String(value)
  }
}

export const questionnaireSubmissionService =
  new QuestionnaireSubmissionService()
