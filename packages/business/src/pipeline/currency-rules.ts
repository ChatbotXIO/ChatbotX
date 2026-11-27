import type { PipelineModel } from "@chatbotx.io/database/types"
import { primaryCurrencyForCountry } from "@chatbotx.io/utils/country-currency"

/**
 * The pipeline currency rules with no I/O, so a light module (variable
 * rendering) can apply them without loading the pipeline or workspace services.
 */

/** What a pipeline follows when its workspace has no usable target country. */
export const PIPELINE_FALLBACK_CURRENCY = "USD"

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
export const workspaceCurrencyDefault = (
  targetCountry: string | null,
): WorkspaceCurrencyDefault => {
  const country = targetCountry?.trim().toUpperCase() ?? null
  const fromCountry = primaryCurrencyForCountry(country)
  return country && fromCountry
    ? { currency: fromCountry, country }
    : { currency: PIPELINE_FALLBACK_CURRENCY, country: null }
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
