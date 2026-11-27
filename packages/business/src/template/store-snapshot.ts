import {
  knownTemplateChannels,
  orderedTemplateChannels,
  TEMPLATE_STORE_MAX_LISTINGS,
  type TemplateChannel,
} from "@chatbotx.io/database/partials"
import type {
  TemplateStoreCategoryRef,
  TemplateStoreSnapshotData,
  TemplateStoreSnapshotRow,
} from "@chatbotx.io/database/repositories"
import { isBigintId } from "@chatbotx.io/database/utils"
import type { DeepReadonly } from "@chatbotx.io/redis"
import { isLocale, type Locale } from "@chatbotx.io/utils/ui-locale"
import { buildTemplateShareUrl } from "./share-url"
import {
  classifyStoreListingForLocale,
  type TemplateStoreAudienceSection,
} from "./store-audience"

export type TemplateStorePublishedTemplate = {
  templateId: string
  name: string
  description: string | null
  imageUrl: string | null
  publisherName: string | null
  categoryIds: string[]
  /** UI locale codes; empty = every language. */
  languages: Locale[]
  /** Channels the template supports, in display order; empty = every channel. */
  channels: TemplateChannel[]
  /** Zone when the visitor views their own language; always `primary` when no visitor language is given. */
  section: TemplateStoreAudienceSection
  shareToken: string
  shareUrl: string
}

export type TemplateStorePublished = {
  categories: TemplateStoreCategoryRef[]
  templates: TemplateStorePublishedTemplate[]
}

/** A snapshot as the cache hands it out: shared, so never mutated. */
export type ReadonlyTemplateStoreSnapshot =
  DeepReadonly<TemplateStoreSnapshotData>

/** A `categoryId` filter that is not a bigint id matches nothing (the SQL compares it as a bigint). */
export const matchesNoCategory = (categoryId: string | undefined): boolean =>
  categoryId !== undefined && !isBigintId(categoryId)

export type TemplateStoreProjectionFilters = {
  categoryId?: string
  /**
   * The keyword as PostgreSQL's `ILIKE` compares it: lowered by the database
   * and unescaped. `null` or absent = no keyword filter.
   */
  keywordLiteral?: string | null
  language?: Locale
  channel?: TemplateChannel
  /** The visitor's UI language: each template gets its zone for that language. */
  viewerLocale?: Locale
}

type SnapshotRow = ReadonlyTemplateStoreSnapshot["rows"][number]

/** True when the snapshot holds more rows than the per-tenant cap, so it is incomplete. */
export const isSnapshotOverCap = (
  snapshot: ReadonlyTemplateStoreSnapshot,
): boolean => snapshot.rows.length > TEMPLATE_STORE_MAX_LISTINGS

/** A stored code the UI no longer lists (a removed locale) is dropped on read, so every consumer sees valid codes only. */
export const knownLanguages = (languages: readonly string[]): Locale[] =>
  languages.filter(isLocale)

/**
 * The time a request evaluates expiry at: the later of its own database clock
 * and the snapshot's load time. A snapshot loaded after this request read its
 * version describes a newer instant, so its own clock is the consistent one;
 * otherwise nothing changed since the load and the request's clock is right.
 */
export const effectiveNowMicros = (
  snapshot: Pick<ReadonlyTemplateStoreSnapshot, "loadedAtMicros">,
  requestNowMicros: string,
): bigint => {
  const request = BigInt(requestNowMicros)
  const loaded = BigInt(snapshot.loadedAtMicros)
  return request > loaded ? request : loaded
}

/** Share expiry at microsecond precision: no expiry, or an expiry at or after now. */
const isShareLiveAt = (row: SnapshotRow, nowMicros: bigint): boolean =>
  row.shareExpiresAtMicros === null ||
  BigInt(row.shareExpiresAtMicros) >= nowMicros

const matchesCategory = (row: SnapshotRow, categoryId: string): boolean =>
  row.categoryIds.includes(BigInt(categoryId).toString())

/** Untagged rows, or rows that list the language. */
const matchesLanguage = (row: SnapshotRow, language: Locale): boolean =>
  row.languages.length === 0 || row.languages.includes(language)

/** Rows that name no known channel (they work everywhere), or list the channel. */
const matchesChannel = (row: SnapshotRow, channel: TemplateChannel): boolean =>
  !row.channels.some((stored) =>
    orderedTemplateChannels.some((known) => known === stored),
  ) || row.channels.some((stored) => stored === channel)

const matchesKeyword = (row: SnapshotRow, literal: string): boolean =>
  row.searchName.includes(literal) ||
  (row.searchPublisherName?.includes(literal) ?? false)

/** One row's filters, in the order the SQL applies them; an absent filter passes. */
const matchesFilters = (
  row: SnapshotRow,
  filters: TemplateStoreProjectionFilters,
): boolean =>
  (filters.categoryId === undefined ||
    matchesCategory(row, filters.categoryId)) &&
  (!filters.keywordLiteral || matchesKeyword(row, filters.keywordLiteral)) &&
  (filters.language === undefined || matchesLanguage(row, filters.language)) &&
  (filters.channel === undefined || matchesChannel(row, filters.channel))

type PublishedRowSource = Pick<
  TemplateStoreSnapshotRow,
  | "templateId"
  | "name"
  | "description"
  | "imageUrl"
  | "publisherName"
  | "shareToken"
> & {
  categoryIds: readonly string[]
  languages: readonly string[]
  channels: readonly string[]
}

/** One visible row as the public store returns it. Shared by the cached and the SQL path; never shares arrays with its source. */
export const toPublishedTemplate = (
  row: PublishedRowSource,
  viewerLocale: Locale | undefined,
  appUrl: string,
): TemplateStorePublishedTemplate => {
  const languages = knownLanguages(row.languages)
  return {
    templateId: row.templateId,
    name: row.name,
    description: row.description,
    imageUrl: row.imageUrl,
    publisherName: row.publisherName,
    categoryIds: [...row.categoryIds],
    languages,
    channels: knownTemplateChannels(row.channels),
    section: viewerLocale
      ? classifyStoreListingForLocale(languages, viewerLocale)
      : "primary",
    shareToken: row.shareToken,
    shareUrl: buildTemplateShareUrl(appUrl, row),
  }
}

/**
 * What a visitor can open, from a snapshot: the same result as the live
 * queries. Categories are the tenant's categories that have at least one
 * visible row (other filters ignored), templates are the visible rows that pass
 * every filter, newest first, cut to the per-tenant cap after filtering.
 * An invalid `categoryId` matches no template but still lists the categories.
 */
export const projectPublished = (
  snapshot: ReadonlyTemplateStoreSnapshot,
  filters: TemplateStoreProjectionFilters,
  requestNowMicros: string,
  appUrl: string,
): TemplateStorePublished => {
  const nowMicros = effectiveNowMicros(snapshot, requestNowMicros)
  const visible = snapshot.rows.filter((row) => isShareLiveAt(row, nowMicros))
  const linked = new Set(visible.flatMap((row) => row.categoryIds))
  const templates = matchesNoCategory(filters.categoryId)
    ? []
    : visible
        .filter((row) => matchesFilters(row, filters))
        .slice(0, TEMPLATE_STORE_MAX_LISTINGS)
  return {
    categories: snapshot.categories
      .filter((category) => linked.has(category.id))
      .map((category) => ({ id: category.id, name: category.name })),
    templates: templates.map((row) =>
      toPublishedTemplate(row, filters.viewerLocale, appUrl),
    ),
  }
}

/** Whether at least one listing is visible right now. */
export const hasVisible = (
  snapshot: ReadonlyTemplateStoreSnapshot,
  requestNowMicros: string,
): boolean => {
  const nowMicros = effectiveNowMicros(snapshot, requestNowMicros)
  return snapshot.rows.some((row) => isShareLiveAt(row, nowMicros))
}
