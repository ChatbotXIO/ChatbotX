import { db, eq } from "@chatbotx.io/database/client"
import {
  questionnaireModel,
  questionnaireQuestionModel,
} from "@chatbotx.io/database/schema"
import { uploader } from "@chatbotx.io/filesystem"
import { createId, mapWithConcurrency } from "@chatbotx.io/utils"
import { sha256Hex } from "@chatbotx.io/utils/crypto"
import { logger } from "../../logger"
import { questionnaireImagePrefix } from "../template-object-keys"
import { insertCopyNamed } from "./naming"
import {
  createFlowRefPatcher,
  dependenciesOn,
  makeCollector,
  recordCopy,
  resolveRef,
  scopedWhere,
  updateNotSupported,
  warnStagedSkip,
} from "./shared"
import type {
  PatchTask,
  ResourceAdapter,
  StagedObject,
  TemplateInstallContext,
  TemplateStageContext,
} from "./types"

type TemplateQuestionnaireQuestionEntry = {
  title: string
  type: (typeof questionnaireQuestionModel.$inferInsert)["type"]
  active: boolean
  image: (typeof questionnaireQuestionModel.$inferInsert)["image"]
  orderNo: number
  point: number
  retryMessage: string | null
  // A source custom-field id, remapped through the custom-field manifest.
  customFieldId: string | null
  systemFieldKey: string | null
  config: (typeof questionnaireQuestionModel.$inferInsert)["config"]
}

type TemplateQuestionnaireEntry = {
  sourceId: string
  name: string
  enableScore: boolean
  enableRetryMessages: boolean
  enableCustomFieldMapping: boolean
  // A `resources.flows` sourceId; questionnaires install before flows, so the
  // trigger flow is always patched afterwards.
  triggerFlowId: string | null
  questions: TemplateQuestionnaireQuestionEntry[]
}

const resolveCustomFieldRef = (
  ctx: TemplateInstallContext,
  entry: TemplateQuestionnaireEntry,
  questionIndex: number,
  customFieldId: string | null,
): string | null =>
  resolveRef(ctx, {
    category: "questionnaires",
    kind: "customField",
    path: `questionnaires.${entry.sourceId}.questions.${questionIndex}.customFieldId`,
    sourceRef: customFieldId,
  })

const QUERY_OR_HASH = /[?#]/

/** Parallel storage copies per questionnaire, to keep staging short. */
const IMAGE_COPY_CONCURRENCY = 4

/** The slot `stage` and `insert` agree on for one question image. */
const questionImageStageKey = (
  sourceId: string,
  questionIndex: number,
): string => `questionnaires:${sourceId}:${questionIndex}`

/**
 * Splits the URL of an image that lives in the publishing workspace's public
 * storage into the object path and the URL prefix before it. Only that prefix
 * is ever copied: the worker copies with its own privileges, so a path into any
 * other workspace (or an external link) is never followed.
 */
const parseCopyableImageUrl = (
  url: string,
  sourceWorkspaceId: string | undefined,
): { path: string; base: string } | null => {
  if (!sourceWorkspaceId) {
    return null
  }
  const marker = `/public/space/${sourceWorkspaceId}/`
  const at = url.indexOf(marker)
  if (at < 0) {
    return null
  }
  const path = url.slice(at + 1).split(QUERY_OR_HASH)[0] ?? ""
  if (path.includes("..") || path.length <= marker.length - 1) {
    return null
  }
  return { path, base: url.slice(0, at + 1) }
}

const questionImageTarget = async (
  ctx: Pick<TemplateStageContext, "workspaceId" | "installationId" | "scope">,
  sourceId: string,
  questionIndex: number,
  path: string,
): Promise<string> =>
  `${questionnaireImagePrefix(ctx.workspaceId, ctx.installationId, ctx.scope)}${await sha256Hex(`${sourceId}:${questionIndex}:${path}`)}`

/**
 * What `insert` writes for a question's image: the staged copy's URL, or the
 * original link when it is external (nothing to copy) or could not be copied
 * (kept, with a warning, rather than losing the image).
 */
const resolveQuestionImage = (
  ctx: TemplateInstallContext,
  entry: TemplateQuestionnaireEntry,
  questionIndex: number,
  image: TemplateQuestionnaireQuestionEntry["image"],
): TemplateQuestionnaireQuestionEntry["image"] => {
  if (!image?.url) {
    return image
  }
  const parsed = parseCopyableImageUrl(image.url, ctx.sourceWorkspaceId)
  if (!parsed) {
    return image
  }
  const staged = ctx.staged?.get(
    questionImageStageKey(entry.sourceId, questionIndex),
  )
  if (!staged || "skipped" in staged) {
    warnStagedSkip(ctx, {
      category: "questionnaires",
      staged,
      fallbackKind: "questionImage",
      path: `questionnaires.${entry.sourceId}.questions.${questionIndex}.image`,
      value: image.url,
    })
    return image
  }
  return { ...image, url: `${parsed.base}${staged.targetPath}` }
}

/**
 * A questionnaire is copied with its questions and none of its submissions or
 * answers. The trigger flow is patched once flows exist; a
 * custom-field mapping that cannot be resolved is dropped with a warning.
 *
 * Question images that live in the publishing workspace's public storage are
 * copied (`stage`, before the apply transaction) to deterministic keys of the
 * installing workspace, so deleting the source later cannot break the copy.
 */
export const questionnairesAdapter: ResourceAdapter<TemplateQuestionnaireEntry> =
  {
    category: "questionnaires",
    providesKinds: ["questionnaire"],
    consumesKinds: ["flow", "customField"],
    deferredKinds: ["flow"],
    trackedKind: "questionnaire",
    folderTypes: [],
    minFormatVersion: 2,
    sync: updateNotSupported("questionnaires"),

    async stage(
      ctx: TemplateStageContext,
      entries: readonly TemplateQuestionnaireEntry[],
    ): Promise<Map<string, StagedObject>> {
      const staged = new Map<string, StagedObject>()
      for (const entry of entries) {
        const jobs = entry.questions.flatMap((question, index) => {
          const parsed = question.image?.url
            ? parseCopyableImageUrl(question.image.url, ctx.sourceWorkspaceId)
            : null
          return parsed ? [{ index, path: parsed.path }] : []
        })
        const copies = await mapWithConcurrency(
          jobs,
          IMAGE_COPY_CONCURRENCY,
          async (job) => {
            const targetPath = await questionImageTarget(
              ctx,
              entry.sourceId,
              job.index,
              job.path,
            )
            await uploader.copyObject(job.path, targetPath)
            ctx.trackCopiedObject(targetPath)
            return targetPath
          },
        )
        for (const [position, copy] of copies.entries()) {
          const key = questionImageStageKey(
            entry.sourceId,
            jobs[position].index,
          )
          if (copy.status === "fulfilled") {
            staged.set(key, { targetPath: copy.value })
            continue
          }
          logger.warn(
            { err: copy.reason, sourceId: entry.sourceId },
            "Template install: questionnaire image could not be copied",
          )
          staged.set(key, { skipped: "questionImage" })
        }
      }
      return staged
    },

    async insert(
      ctx: TemplateInstallContext,
      entries: readonly TemplateQuestionnaireEntry[],
    ): Promise<PatchTask[]> {
      const flowRefs = createFlowRefPatcher("questionnaires")

      for (const entry of entries) {
        const created = await insertCopyNamed(ctx, {
          category: "questionnaires",
          constraint: "Questionnaire_workspaceId_name_key",
          entry,
          findTaken: (tx, name) =>
            tx.query.questionnaireModel.findMany({
              where: { workspaceId: ctx.workspaceId, name },
              columns: { name: true },
            }),
          insert: (tx, name) =>
            tx
              .insert(questionnaireModel)
              .values({
                id: createId(),
                workspaceId: ctx.workspaceId,
                name,
                enableScore: entry.enableScore,
                enableRetryMessages: entry.enableRetryMessages,
                enableCustomFieldMapping: entry.enableCustomFieldMapping,
                triggerFlowId: null,
              })
              .returning()
              .then(([row]) => row),
        })
        if (!created) {
          continue
        }

        recordCopy(ctx, {
          category: "questionnaires",
          resourceKind: "questionnaire",
          idMapKind: "questionnaire",
          sourceId: entry.sourceId,
          resourceId: created.id,
        })

        flowRefs.defer({
          sourceEntryId: entry.sourceId,
          field: "triggerFlowId",
          sourceFlowId: entry.triggerFlowId,
          write: async (tx, triggerFlowId) => {
            await tx
              .update(questionnaireModel)
              .set({ triggerFlowId })
              .where(eq(questionnaireModel.id, created.id))
          },
        })
        if (entry.questions.length === 0) {
          continue
        }
        await ctx.tx.insert(questionnaireQuestionModel).values(
          entry.questions.map((question, index) => ({
            id: createId(),
            questionnaireId: created.id,
            title: question.title,
            type: question.type,
            active: question.active,
            image: resolveQuestionImage(ctx, entry, index, question.image),
            orderNo: question.orderNo,
            point: question.point,
            retryMessage: question.retryMessage,
            customFieldId: resolveCustomFieldRef(
              ctx,
              entry,
              index,
              question.customFieldId,
            ),
            systemFieldKey: question.systemFieldKey,
            config: question.config,
          })),
        )
      }

      return flowRefs.tasks()
    },

    collector: makeCollector({
      findIds: (query) =>
        db.query.questionnaireModel.findMany({
          where: scopedWhere(query, { deletedAt: { isNull: true } }),
          columns: { id: true },
          limit: query.limit,
        }),

      async collectRows(workspaceId, ids) {
        const rows = await db.query.questionnaireModel.findMany({
          where: scopedWhere(
            { workspaceId, ids },
            { deletedAt: { isNull: true } },
          ),
        })
        const questions = await db.query.questionnaireQuestionModel.findMany({
          where: {
            questionnaireId: { in: rows.map((row) => row.id) },
            deletedAt: { isNull: true },
          },
          orderBy: { orderNo: "asc" },
        })
        const questionsByQuestionnaire = Map.groupBy(
          questions,
          (question) => question.questionnaireId,
        )
        const entries = rows.map((row) => ({
          sourceId: row.id,
          name: row.name,
          enableScore: row.enableScore,
          enableRetryMessages: row.enableRetryMessages,
          enableCustomFieldMapping: row.enableCustomFieldMapping,
          triggerFlowId: row.triggerFlowId,
          questions: (questionsByQuestionnaire.get(row.id) ?? []).map(
            (question) => ({
              title: question.title,
              type: question.type,
              active: question.active,
              image: question.image,
              orderNo: question.orderNo,
              point: question.point,
              retryMessage: question.retryMessage,
              customFieldId: question.customFieldId,
              systemFieldKey: question.systemFieldKey,
              config: question.config,
            }),
          ),
        }))
        // The trigger flow travels with the questionnaire it starts.
        return {
          entries,
          hardDependencies: dependenciesOn(
            "flows",
            rows.map((row) => row.triggerFlowId),
          ),
        }
      },
    }),
  }
