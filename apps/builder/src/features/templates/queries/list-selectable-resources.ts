import {
  type ListSelectableResourcesResult,
  templateService,
} from "@chatbotx.io/business"
import type { TemplateCategory } from "@chatbotx.io/database/partials"

export type {
  ListSelectableResourcesResult,
  SelectableResourceItem,
} from "@chatbotx.io/business"

export const listSelectableResources = async (input: {
  workspaceId: string
  category: TemplateCategory
  keyword?: string | null
  cursor?: string | null
  limit?: number | null
}): Promise<ListSelectableResourcesResult> =>
  await templateService.listSelectableResources(input)
