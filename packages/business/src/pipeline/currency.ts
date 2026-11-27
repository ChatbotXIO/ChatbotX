import { workspaceService } from "../workspace/service"
import {
  applyEffectiveCurrency,
  PIPELINE_FALLBACK_CURRENCY,
  type WithEffectiveCurrency,
  type WorkspaceCurrencyDefault,
  workspaceCurrencyDefault,
} from "./currency-rules"

export {
  applyEffectiveCurrency,
  type PipelineWithCurrency,
  type WithEffectiveCurrency,
  type WorkspaceCurrencyDefault,
} from "./currency-rules"

/** The workspace's default pipeline currency (cached workspace read). */
export async function resolveWorkspaceDefault(
  workspaceId: string,
): Promise<WorkspaceCurrencyDefault> {
  const workspace = await workspaceService.findById({ id: workspaceId })
  return workspaceCurrencyDefault(workspace.targetCountry)
}

export async function resolveWorkspaceCurrency(
  workspaceId: string,
): Promise<string> {
  return (await resolveWorkspaceDefault(workspaceId)).currency
}

/** Maps one row; reads the workspace only when the row has no override. */
export async function withEffectiveCurrency<
  T extends { currency: string | null },
>(workspaceId: string, row: T): Promise<WithEffectiveCurrency<T>> {
  return applyEffectiveCurrency(
    row,
    row.currency ?? (await resolveWorkspaceCurrency(workspaceId)),
  )
}

/** Maps many rows with at most one workspace read, none when all override. */
export async function withEffectiveCurrencies<
  T extends { currency: string | null },
>(
  workspaceId: string,
  rows: readonly T[],
): Promise<WithEffectiveCurrency<T>[]> {
  // Only read when some row follows the workspace; the fallback is never used
  // for a row that has an override.
  const workspaceCurrency = rows.some((row) => row.currency === null)
    ? await resolveWorkspaceCurrency(workspaceId)
    : PIPELINE_FALLBACK_CURRENCY
  return rows.map((row) => applyEffectiveCurrency(row, workspaceCurrency))
}
