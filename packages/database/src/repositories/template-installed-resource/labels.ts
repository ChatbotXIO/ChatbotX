import { type DatabaseClient, db } from "../../client"
import type { TemplateResourceKind } from "../../partials/template"

type LabelLoader = (
  workspaceId: string,
  ids: string[],
  tx: DatabaseClient,
) => Promise<{ id: string; label: string }[]>

const named =
  (
    load: (
      workspaceId: string,
      ids: string[],
      tx: DatabaseClient,
    ) => Promise<{ id: string; name: string }[]>,
  ): LabelLoader =>
  async (workspaceId, ids, tx) =>
    (await load(workspaceId, ids, tx)).map((row) => ({
      id: row.id,
      label: row.name,
    }))

const where = (workspaceId: string, ids: string[]) => ({
  workspaceId,
  id: { in: ids },
})
const columns = { id: true, name: true } as const

/**
 * Display label of each tracked resource kind: one batched query per kind
 * present on the page, so resolving a page of resources never turns into one
 * query per row. A kind without a loader (or a row since deleted) simply has
 * no label.
 */
const LABEL_LOADERS: Record<TemplateResourceKind, LabelLoader> = {
  flow: named((w, ids, tx) =>
    tx.query.flowModel.findMany({ where: where(w, ids), columns }),
  ),
  aiAgent: named((w, ids, tx) =>
    tx.query.aiAgentModel.findMany({ where: where(w, ids), columns }),
  ),
  aiFunction: named((w, ids, tx) =>
    tx.query.aiFunctionModel.findMany({ where: where(w, ids), columns }),
  ),
  calendar: named((w, ids, tx) =>
    tx.query.appointmentCalendarModel.findMany({
      where: where(w, ids),
      columns,
    }),
  ),
  integrationWebchat: named((w, ids, tx) =>
    tx.query.integrationWebchatModel.findMany({
      where: where(w, ids),
      columns,
    }),
  ),
  automatedResponse: async (w, ids, tx) =>
    (
      await tx.query.automatedResponseModel.findMany({
        where: where(w, ids),
        columns: { id: true, keywords: true },
      })
    ).map((row) => ({ id: row.id, label: row.keywords.join(", ") })),
  reflink: named((w, ids, tx) =>
    tx.query.reflinkModel.findMany({ where: where(w, ids), columns }),
  ),
  trigger: named((w, ids, tx) =>
    tx.query.triggerModel.findMany({ where: where(w, ids), columns }),
  ),
  fbCommentAutomation: named((w, ids, tx) =>
    tx.query.commentAutomationModel.findMany({
      where: where(w, ids),
      columns,
    }),
  ),
  product: named((w, ids, tx) =>
    tx.query.productModel.findMany({ where: where(w, ids), columns }),
  ),
  savedReply: async (w, ids, tx) =>
    (
      await tx.query.savedReplyModel.findMany({
        where: where(w, ids),
        columns: { id: true, shortcut: true },
      })
    ).map((row) => ({ id: row.id, label: row.shortcut })),
  botField: named((w, ids, tx) =>
    tx.query.botFieldModel.findMany({ where: where(w, ids), columns }),
  ),
  customField: named((w, ids, tx) =>
    tx.query.customFieldModel.findMany({ where: where(w, ids), columns }),
  ),
  tag: named((w, ids, tx) =>
    tx.query.tagModel.findMany({ where: where(w, ids), columns }),
  ),
  folder: named((w, ids, tx) =>
    tx.query.folderModel.findMany({ where: where(w, ids), columns }),
  ),
  aiFile: named((w, ids, tx) =>
    tx.query.aiFileModel.findMany({ where: where(w, ids), columns }),
  ),
  aiMcpServer: named((w, ids, tx) =>
    tx.query.aiMCPServerModel.findMany({ where: where(w, ids), columns }),
  ),
  sequence: named((w, ids, tx) =>
    tx.query.sequenceModel.findMany({ where: where(w, ids), columns }),
  ),
  questionnaire: named((w, ids, tx) =>
    tx.query.questionnaireModel.findMany({ where: where(w, ids), columns }),
  ),
  couponTopic: named((w, ids, tx) =>
    tx.query.couponTopicModel.findMany({ where: where(w, ids), columns }),
  ),
  pipeline: named((w, ids, tx) =>
    tx.query.pipelineModel.findMany({ where: where(w, ids), columns }),
  ),
  productCategory: named((w, ids, tx) =>
    tx.query.productCategoryModel.findMany({ where: where(w, ids), columns }),
  ),
}

/** `resourceId → label` for the given rows, one query per distinct kind. */
export const loadResourceLabels = async (
  workspaceId: string,
  resources: readonly { resourceKind: string; resourceId: string }[],
  tx: DatabaseClient = db,
): Promise<Map<string, string>> => {
  const idsByKind = new Map<string, string[]>()
  for (const { resourceKind, resourceId } of resources) {
    idsByKind.set(resourceKind, [
      ...(idsByKind.get(resourceKind) ?? []),
      resourceId,
    ])
  }
  const labels = new Map<string, string>()
  await Promise.all(
    [...idsByKind].map(async ([kind, ids]) => {
      const load = LABEL_LOADERS[kind as TemplateResourceKind] as
        | LabelLoader
        | undefined
      if (!load) {
        return
      }
      for (const row of await load(workspaceId, ids, tx)) {
        labels.set(`${kind}:${row.id}`, row.label)
      }
    }),
  )
  return labels
}
