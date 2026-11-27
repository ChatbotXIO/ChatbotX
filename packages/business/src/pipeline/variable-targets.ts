import { pipelineSettingsSchema } from "@chatbotx.io/database/partials"
import { pipelineVariableTargetRepository } from "@chatbotx.io/database/repositories"
import type { PipelineItemModel } from "@chatbotx.io/database/types"
import {
  applyEffectiveCurrency,
  workspaceCurrencyDefault,
} from "./currency-rules"

/** The item a `{{pipelines.<ref>.<attr>}}` variable reads, one per pipeline. */
export type PipelineVariableTarget = {
  id: string
  /** The pipeline's `referenceName`. */
  referenceName: string
  /** The item's title. */
  name: string
  stageName: string
  status: PipelineItemModel["status"]
  /** The pipeline's own label for `status` (e.g. "Closed won"). */
  statusLabel: string
  priority: PipelineItemModel["priority"]
  value: number | null
  currency: string
  assignedAdmins: string[]
  createdAt: Date
  dueDate: Date | null
  updatedAt: Date
}

/**
 * What the variables read for a contact: per pipeline its latest open item,
 * else its latest item. System context (no access scope), one query. A
 * separate module so variable rendering does not load the pipeline services.
 */
export async function loadPipelineVariableTargets(input: {
  workspaceId: string
  contactId: string
}): Promise<PipelineVariableTarget[]> {
  const rows = await pipelineVariableTargetRepository.listForContact(input)
  // The target country comes back with the rows, so the effective currency
  // needs no service or extra read; every row is the same workspace.
  const workspaceCurrency = workspaceCurrencyDefault(
    rows[0]?.targetCountry ?? null,
  ).currency
  return rows.map((row) => ({
    id: row.itemId,
    referenceName: row.referenceName,
    name: row.title,
    stageName: row.stageName,
    status: row.status,
    statusLabel: pipelineSettingsSchema.parse(row.settings).statusLabels[
      row.status
    ],
    priority: row.priority,
    value: row.value,
    currency: applyEffectiveCurrency(row, workspaceCurrency).currency,
    assignedAdmins: (row.assignees ?? []).filter(
      (name): name is string => typeof name === "string" && name !== "",
    ),
    createdAt: row.createdAt,
    dueDate: row.dueDate,
    updatedAt: row.updatedAt,
  }))
}

/** `{{last_opportunity_id}}`: id of the contact's last created or updated item, any pipeline. */
export async function loadLastPipelineItemId(input: {
  workspaceId: string
  contactId: string
}): Promise<string | null> {
  return await pipelineVariableTargetRepository.findLastTouchedItemId(input)
}
