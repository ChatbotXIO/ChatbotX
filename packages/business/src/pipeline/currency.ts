import type { PipelineModel } from "@chatbotx.io/database/types"
import { primaryCurrencyForCountry } from "@chatbotx.io/utils/country-currency"
import { workspaceService } from "../workspace/service"

const FALLBACK_CURRENCY = "USD"

/**
 * A pipeline as callers see it: `currency` is always the one to display, format
 * and emit; `currencyOverride` is the stored value (null = follows the
 * workspace) and is only for settings and the API.
 */
export type WithEffectiveCurrency<T extends { currency: string | null }> = Omit<
  T,
  "currency"
> & {
  currency: string
  currencyOverride: string | null
}

/** A pipeline row mapped for a response. */
export type PipelineWithCurrency = WithEffectiveCurrency<PipelineModel>

/** What a pipeline without an override falls back to, and where that comes from. */
export type WorkspaceCurrencyDefault = {
  currency: string
  /** ISO 3166-1 alpha-2 target country it comes from; null when it is the USD fallback. */
  country: string | null
}

/**
 * The currency a pipeline without an override uses: the primary currency of
 * the workspace's target country, else USD.
 */
export async function resolveWorkspaceDefault(
  workspaceId: string,
): Promise<WorkspaceCurrencyDefault> {
  const workspace = await workspaceService.findById({ id: workspaceId })
  const country = workspace.targetCountry?.trim().toUpperCase() ?? null
  const fromCountry = primaryCurrencyForCountry(country)
  return country && fromCountry
    ? { currency: fromCountry, country }
    : { currency: FALLBACK_CURRENCY, country: null }
}

export async function resolveWorkspaceCurrency(
  workspaceId: string,
): Promise<string> {
  return (await resolveWorkspaceDefault(workspaceId)).currency
}

/**
 * Maps one row: its own currency when it has one, else `workspaceCurrency`.
 * The only place the "override wins" rule lives.
 */
export const applyEffectiveCurrency = <T extends { currency: string | null }>(
  row: T,
  workspaceCurrency: string,
): WithEffectiveCurrency<T> => ({
  ...row,
  currency: row.currency ?? workspaceCurrency,
  currencyOverride: row.currency,
})

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
    : FALLBACK_CURRENCY
  return rows.map((row) => applyEffectiveCurrency(row, workspaceCurrency))
}
