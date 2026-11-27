import type { PgTable } from "drizzle-orm/pg-core"
import { type DatabaseClient, db, sql } from "../../client"
import type { TemplateResourceKind } from "../../partials/template"
import {
  aiAgentModel,
  aiFileModel,
  aiFunctionModel,
  aiMCPServerModel,
  appointmentCalendarModel,
  automatedResponseModel,
  botFieldModel,
  commentAutomationModel,
  couponTopicModel,
  customFieldModel,
  discountCodeModel,
  dynamicImageModel,
  ecommerceOpenHoursModel,
  ecommerceSettingsModel,
  flowModel,
  folderModel,
  igStoryAutomationModel,
  inboundWebhookModel,
  integrationWebchatModel,
  leaderboardModel,
  magicLinkModel,
  miniAppModel,
  minigameModel,
  pipelineModel,
  placeCategoryModel,
  placeLocationModel,
  pollModel,
  productCategoryModel,
  productModel,
  questionnaireModel,
  reflinkModel,
  savedReplyModel,
  sequenceModel,
  tagModel,
  triggerModel,
  vendorModel,
} from "../../schema"

/** Built on use: a module that only imports this file must not need the schema. */
const modelOfKind = (): Record<TemplateResourceKind, PgTable> => ({
  flow: flowModel,
  aiAgent: aiAgentModel,
  aiFunction: aiFunctionModel,
  calendar: appointmentCalendarModel,
  integrationWebchat: integrationWebchatModel,
  automatedResponse: automatedResponseModel,
  reflink: reflinkModel,
  trigger: triggerModel,
  fbCommentAutomation: commentAutomationModel,
  product: productModel,
  savedReply: savedReplyModel,
  botField: botFieldModel,
  customField: customFieldModel,
  tag: tagModel,
  folder: folderModel,
  pipeline: pipelineModel,
  productCategory: productCategoryModel,
  placeCategory: placeCategoryModel,
  sequence: sequenceModel,
  aiMcpServer: aiMCPServerModel,
  aiFile: aiFileModel,
  questionnaire: questionnaireModel,
  couponTopic: couponTopicModel,
  magicLink: magicLinkModel,
  poll: pollModel,
  dynamicImage: dynamicImageModel,
  placeLocation: placeLocationModel,
  miniApp: miniAppModel,
  minigame: minigameModel,
  leaderboard: leaderboardModel,
  openHours: ecommerceOpenHoursModel,
  vendor: vendorModel,
  discountCode: discountCodeModel,
  storeSettings: ecommerceSettingsModel,
  storyAutomation: igStoryAutomationModel,
  inboundWebhook: inboundWebhookModel,
})

/**
 * Rows written in one transaction share `createdAt` (`now()` is the
 * transaction's start), so a list sorted by it comes back in no set order.
 * Moves each row one millisecond past the one before it, in the order given:
 * every such list then keeps that order, and the date shown is still the
 * install's. One statement per kind.
 */
export const spreadCreatedAt = async (
  rows: readonly { resourceKind: TemplateResourceKind; resourceId: string }[],
  tx: DatabaseClient = db,
): Promise<void> => {
  const idsByKind = Map.groupBy(rows, (row) => row.resourceKind)
  const models = modelOfKind()
  for (const [kind, kindRows] of idsByKind) {
    if (kindRows.length < 2) {
      continue
    }
    const ids = sql.join(
      kindRows.map((row) => sql`${row.resourceId}`),
      sql`, `,
    )
    await tx.execute(sql`
      UPDATE ${models[kind]} AS target
      SET "createdAt" = target."createdAt" + ordered.position * interval '1 millisecond'
      FROM unnest(ARRAY[${ids}]::bigint[]) WITH ORDINALITY AS ordered(id, position)
      WHERE target.id = ordered.id
    `)
  }
}
