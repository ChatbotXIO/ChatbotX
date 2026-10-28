import type {
  PipelineBoardStage,
  PipelineItemView,
} from "@chatbotx.io/business/pipeline"
import type {
  PipelineSettings,
  PipelineType,
} from "@chatbotx.io/database/partials"
import type { CustomFieldType } from "@chatbotx.io/utils/custom-field"
import type { z } from "zod"
import type {
  boardFilterState,
  pipelineItemFilterRequest,
  pipelineItemSortRequest,
} from "../../schema/query"

/** One card as the board API returns it (dates stay `Date` over oRPC). */
export type BoardItemView = PipelineItemView

/** A board column: stage, totals and its first page of cards. */
export type BoardColumn = PipelineBoardStage

/** The filter as the sheet and URL hold it (relative date presets included). */
export type BoardFilterInput = z.infer<typeof boardFilterState>
/** The filter as the API takes it: presets already resolved to ranges. */
export type BoardFilterRequest = z.infer<typeof pipelineItemFilterRequest>
export type BoardSortInput = z.infer<typeof pipelineItemSortRequest>

/** The pipeline facts the board panels (settings, filter, analytics, add) read. */
export type BoardPipeline = {
  id: string
  name: string
  referenceName: string
  currency: string
  /** The pipeline's own currency; null while it follows the workspace default. */
  currencyOverride: string | null
  type: PipelineType
  settings: PipelineSettings
}

/** A custom field as the panels render it. */
export type BoardField = {
  id: string
  name: string
  referenceName: string
  type: CustomFieldType
  required: boolean
}
