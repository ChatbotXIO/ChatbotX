import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const questionnaireRelations = defineRelationsPart(schema, (r) => ({
  questionnaireModel: {
    workspace: r.one.workspaceModel({
      from: r.questionnaireModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    triggerFlow: r.one.flowModel({
      from: r.questionnaireModel.triggerFlowId,
      to: r.flowModel.id,
    }),
    questions: r.many.questionnaireQuestionModel({
      from: r.questionnaireModel.id,
      to: r.questionnaireQuestionModel.questionnaireId,
    }),
    submissions: r.many.questionnaireSubmissionModel({
      from: r.questionnaireModel.id,
      to: r.questionnaireSubmissionModel.questionnaireId,
    }),
  },
  questionnaireQuestionModel: {
    questionnaire: r.one.questionnaireModel({
      from: r.questionnaireQuestionModel.questionnaireId,
      to: r.questionnaireModel.id,
      optional: false,
    }),
    customField: r.one.customFieldModel({
      from: r.questionnaireQuestionModel.customFieldId,
      to: r.customFieldModel.id,
    }),
    answers: r.many.questionnaireAnswerModel({
      from: r.questionnaireQuestionModel.id,
      to: r.questionnaireAnswerModel.questionId,
    }),
  },
  questionnaireSubmissionModel: {
    questionnaire: r.one.questionnaireModel({
      from: r.questionnaireSubmissionModel.questionnaireId,
      to: r.questionnaireModel.id,
      optional: false,
    }),
    contact: r.one.contactModel({
      from: r.questionnaireSubmissionModel.contactId,
      to: r.contactModel.id,
      optional: false,
    }),
    conversation: r.one.conversationModel({
      from: r.questionnaireSubmissionModel.conversationId,
      to: r.conversationModel.id,
    }),
    currentQuestion: r.one.questionnaireQuestionModel({
      from: r.questionnaireSubmissionModel.currentQuestionId,
      to: r.questionnaireQuestionModel.id,
    }),
    answers: r.many.questionnaireAnswerModel({
      from: r.questionnaireSubmissionModel.id,
      to: r.questionnaireAnswerModel.submissionId,
    }),
  },
  questionnaireAnswerModel: {
    submission: r.one.questionnaireSubmissionModel({
      from: r.questionnaireAnswerModel.submissionId,
      to: r.questionnaireSubmissionModel.id,
      optional: false,
    }),
    question: r.one.questionnaireQuestionModel({
      from: r.questionnaireAnswerModel.questionId,
      to: r.questionnaireQuestionModel.id,
      optional: false,
    }),
  },
}))
