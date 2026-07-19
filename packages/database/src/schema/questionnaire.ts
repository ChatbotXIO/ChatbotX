import { isNull, sql } from "drizzle-orm"
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  type QuestionnaireQuestionImage,
  type QuestionnaireQuestionType,
  type QuestionnaireSubmissionStatus,
  questionnaireQuestionTypes,
  questionnaireSubmissionStatuses,
} from "../partials/questionnaire"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { contactModel } from "./contact"
import { conversationModel } from "./conversation"
import { customFieldModel } from "./custom-field"
import { flowModel } from "./flow"
import { workspaceModel } from "./workspace"

export type QuestionnaireChoiceOption = {
  id: string
  label: string
  points?: number
}

export type QuestionnaireQuestionConfig = {
  options?: QuestionnaireChoiceOption[]
}

export type QuestionnaireAnswerValue =
  | string
  | number
  | {
      optionId: string
      label: string
    }
  | null

export const questionnaireQuestionType = pgEnum(
  "questionnaireQuestionType",
  questionnaireQuestionTypes.options as [
    QuestionnaireQuestionType,
    ...QuestionnaireQuestionType[],
  ],
)

export const questionnaireSubmissionStatus = pgEnum(
  "questionnaireSubmissionStatus",
  questionnaireSubmissionStatuses.options as [
    QuestionnaireSubmissionStatus,
    ...QuestionnaireSubmissionStatus[],
  ],
)

export const questionnaireModel = pgTable(
  "Questionnaire",
  {
    ...sharedColumns,
    name: text().notNull(),
    enableScore: boolean().default(false).notNull(),
    enableRetryMessages: boolean().default(false).notNull(),
    enableCustomFieldMapping: boolean().default(true).notNull(),
    deletedAt: timestamp(timestampConfig),
    triggerFlowId: bigintAsString().references(() => flowModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    index("Questionnaire_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    uniqueIndex("Questionnaire_workspaceId_name_key")
      .using(
        "btree",
        table.workspaceId.asc().nullsLast(),
        table.name.asc().nullsLast(),
      )
      .where(isNull(table.deletedAt)),
  ],
)

export const questionnaireQuestionModel = pgTable(
  "QuestionnaireQuestion",
  {
    ...sharedColumns,
    questionnaireId: bigintAsString()
      .notNull()
      .references(() => questionnaireModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    title: text().notNull(),
    type: questionnaireQuestionType().notNull(),
    active: boolean().default(true).notNull(),
    image: jsonb().$type<QuestionnaireQuestionImage>(),
    orderNo: integer().default(0).notNull(),
    point: integer().default(1).notNull(),
    retryMessage: text(),
    customFieldId: bigintAsString().references(() => customFieldModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    systemFieldKey: text(),
    config: jsonb().$type<QuestionnaireQuestionConfig>(),
    deletedAt: timestamp(timestampConfig),
  },
  (table) => [
    index("QuestionnaireQuestion_questionnaireId_orderNo_idx").using(
      "btree",
      table.questionnaireId.asc().nullsLast(),
      table.orderNo.asc().nullsLast(),
    ),
    index("QuestionnaireQuestion_customFieldId_idx").using(
      "btree",
      table.customFieldId.asc().nullsLast(),
    ),
    check(
      "QuestionnaireQuestion_customFieldId_systemFieldKey_exclusive",
      sql`("customFieldId" IS NULL) OR ("systemFieldKey" IS NULL)`,
    ),
  ],
)

export const questionnaireSubmissionModel = pgTable(
  "QuestionnaireSubmission",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    questionnaireId: bigintAsString()
      .notNull()
      .references(() => questionnaireModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactId: bigintAsString()
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    conversationId: bigintAsString().references(() => conversationModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    status: questionnaireSubmissionStatus().default("inProgress").notNull(),
    totalPoints: integer(),
    currentQuestionId: bigintAsString().references(
      () => questionnaireQuestionModel.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
    currentQuestionSentAt: timestamp(timestampConfig),
    lastAnsweredMessageId: bigintAsString(),
    startedAt: timestamp(timestampConfig).defaultNow().notNull(),
    completedAt: timestamp(timestampConfig),
    cancelledAt: timestamp(timestampConfig),
  },
  (table) => [
    index("QuestionnaireSubmission_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("QuestionnaireSubmission_questionnaireId_status_idx").using(
      "btree",
      table.questionnaireId.asc().nullsLast(),
      table.status.asc().nullsLast(),
    ),
    index("QuestionnaireSubmission_questionnaireId_contactId_idx").using(
      "btree",
      table.questionnaireId.asc().nullsLast(),
      table.contactId.asc().nullsLast(),
    ),
    uniqueIndex("QuestionnaireSubmission_workspaceId_contactId_active_key")
      .on(table.workspaceId, table.contactId)
      .where(sql`${table.status} = 'inProgress'`),
  ],
)

export const questionnaireAnswerModel = pgTable(
  "QuestionnaireAnswer",
  {
    ...sharedColumns,
    submissionId: bigintAsString()
      .notNull()
      .references(() => questionnaireSubmissionModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    questionId: bigintAsString()
      .notNull()
      .references(() => questionnaireQuestionModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    questionIdSnapshot: text().notNull(),
    questionTitleSnapshot: text().notNull(),
    questionTypeSnapshot: text().notNull(),
    labelSnapshot: text().notNull(),
    value: jsonb().$type<QuestionnaireAnswerValue>(),
    pointsEarned: integer(),
    attemptCount: integer().default(1).notNull(),
    answeredAt: timestamp(timestampConfig).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("QuestionnaireAnswer_submissionId_questionIdSnapshot_key").on(
      table.submissionId,
      table.questionIdSnapshot,
    ),
    index("QuestionnaireAnswer_questionId_idx").using(
      "btree",
      table.questionId.asc().nullsLast(),
    ),
  ],
)
