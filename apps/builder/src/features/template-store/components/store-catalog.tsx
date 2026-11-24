"use client"

import { orderedTemplateChannels } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { isLocale } from "@chatbotx.io/utils/ui-locale"
import { LanguagesIcon, SearchIcon, StoreIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs"
import type { ReactNode } from "react"
import { localeMeta } from "@/i18n/config"
import {
  filterStoreTemplates,
  groupStoreTemplatesByCategory,
  listStoreChannelOptions,
  listStoreLanguageOptions,
  resolveStoreChannel,
  resolveStoreLanguageView,
  STORE_ALL_LANGUAGES,
  type StoreCatalogCategory,
  type StoreCatalogTemplate,
  type StoreLanguageView,
  splitStoreSections,
} from "../lib/filter-store-templates"
import { StoreChannelTabs } from "./store-channel-tabs"
import { TemplateChannelIcons } from "./template-channel-icons"

/** What every layout shares; the variant only adds the page chrome around it. */
const STORE_CATALOG_BASE_CLASS_NAME = "flex w-full flex-col gap-8"

/** The space between category sections, wider than inside a grid. */
const STORE_SECTIONS_CLASS_NAME = "flex flex-col gap-10"

/** A language's own name; an unknown code (a locale since removed) shows as is. */
const languageLabel = (language: string): string =>
  isLocale(language) ? localeMeta[language].nativeLabel : language

/**
 * The heading level of the category titles in each zone of the store: the
 * main zone's sit right under the page's heading, the "Other languages"
 * zone's under that zone's own title.
 */
const STORE_ZONE_SECTION_HEADING_TAGS = { primary: "h2", other: "h3" } as const

type StoreZone = keyof typeof STORE_ZONE_SECTION_HEADING_TAGS

/** The "Other languages" title sits at the level of the main zone's category titles. */
const STORE_OTHER_ZONE_HEADING_TAG = STORE_ZONE_SECTION_HEADING_TAGS.primary

type StoreCatalogTitle = {
  tag: "h1"
  className: string
}

type StoreCatalogLayoutConfig = {
  /** The title above the store; `null` when the page around it already names it (the home tab). */
  title: StoreCatalogTitle | null
  className: string
  gridClassName: string
}

/**
 * Both layouts share the header: the search and language controls, then the
 * channel tabs. `page` is the public `/store` page, so it adds its own title
 * ("Template store") as the page's h1 and the grid follows the window width.
 * `embedded` is a tab of the home page, under its welcome h1: no title of its
 * own, so the category titles are the h2s, and the grid follows the width of
 * its own container (the account rail takes part of the window): as many
 * columns as fit cards of at least 17rem.
 */
const STORE_CATALOG_LAYOUTS = {
  page: {
    title: {
      tag: "h1",
      className: "font-bold text-3xl tracking-tight sm:text-4xl",
    },
    className: "mx-auto max-w-6xl pt-4 sm:pt-10",
    gridClassName: "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3",
  },
  embedded: {
    title: null,
    className: "",
    gridClassName:
      "grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-5",
  },
} as const satisfies Record<string, StoreCatalogLayoutConfig>

type StoreCatalogLayout = keyof typeof STORE_CATALOG_LAYOUTS

type StoreCatalogProps = {
  categories: StoreCatalogCategory[]
  templates: StoreCatalogTemplate[]
  /** The visitor's UI language: the language filter starts on it. */
  viewerLocale: string
  layout?: StoreCatalogLayout
}

/**
 * The catalog is loaded whole, so searching and switching channel or language
 * only change the URL in the browser: `shallow` keeps the server page from running
 * again on every keystroke (the app-wide default re-renders it), `replace`
 * keeps Back from stepping through every letter.
 */
const STORE_URL_STATE_OPTIONS = {
  shallow: true,
  scroll: false,
  history: "replace",
  clearOnDefault: true,
} as const

/**
 * The template store: search, language select and channel tabs, then the
 * templates grouped into category sections. The whole catalog is loaded once
 * (it is capped per tenant), so filtering is client-side; the search, channel
 * and language live in the URL, so a view can be shared.
 */
export function StoreCatalog({
  categories,
  templates,
  viewerLocale,
  layout = "page",
}: StoreCatalogProps) {
  const t = useTranslations("templateStore.store")
  const tTemplateStore = useTranslations("templateStore")
  const layoutConfig = STORE_CATALOG_LAYOUTS[layout]
  const title = layoutConfig.title
  const OtherZoneHeading = STORE_OTHER_ZONE_HEADING_TAG
  // An unknown value in the URL parses to null, which reads as all channels.
  const [channelParam, setChannelParam] = useQueryState(
    "channel",
    parseAsStringLiteral(orderedTemplateChannels).withOptions(
      STORE_URL_STATE_OPTIONS,
    ),
  )
  const [languageParam, setLanguageParam] = useQueryState(
    "lang",
    parseAsString.withOptions(STORE_URL_STATE_OPTIONS),
  )
  const [query, setQuery] = useQueryState(
    "q",
    parseAsString.withDefault("").withOptions(STORE_URL_STATE_OPTIONS),
  )

  if (templates.length === 0) {
    return <StoreMessage icon={<StoreIcon />} text={t("empty")} />
  }

  // The filter only helps when there is another language than the visitor's.
  const languages = listStoreLanguageOptions(templates, viewerLocale)
  const showLanguageFilter = languages.length > 1
  // Starts on the visitor's language; a stale value in the URL falls back to it.
  const languageView: StoreLanguageView = resolveStoreLanguageView({
    param: showLanguageFilter ? languageParam : null,
    options: languages,
    viewerLocale,
  })
  // The tabs list the channels the chosen language shows; one it hides, or nothing carries, reads as all.
  const channels = listStoreChannelOptions(
    filterStoreTemplates({
      templates,
      channel: undefined,
      languageView,
      query: "",
    }),
  )
  const activeChannel = resolveStoreChannel({
    param: channelParam,
    options: channels,
  })
  const selectedLanguageLabel =
    languageView.value === STORE_ALL_LANGUAGES
      ? t("allLanguages")
      : languageLabel(languageView.value)
  const visible = filterStoreTemplates({
    templates,
    channel: activeChannel,
    languageView,
    query,
  })
  const { primary, other } = splitStoreSections(visible, languageView)
  return (
    <div className={cn(STORE_CATALOG_BASE_CLASS_NAME, layoutConfig.className)}>
      <div className="flex flex-col gap-4">
        {title ? (
          <title.tag className={title.className}>
            {tTemplateStore("title")}
          </title.tag>
        ) : null}
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute start-3 top-3 size-4 text-muted-foreground" />
            <Input
              aria-label={t("search")}
              className="h-10 rounded-lg bg-background ps-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("search")}
              type="search"
              value={query}
            />
          </div>
          {showLanguageFilter ? (
            <Select
              items={[
                { value: STORE_ALL_LANGUAGES, label: t("allLanguages") },
                ...languages.map((language) => ({
                  value: language,
                  label: languageLabel(language),
                })),
              ]}
              onValueChange={(value) =>
                // The visitor's own language is the default, so it leaves the URL clean.
                setLanguageParam(
                  String(value) === viewerLocale ? null : String(value),
                )
              }
              value={languageView.value}
            >
              <SelectTrigger
                aria-label={t("languageValue", {
                  language: selectedLanguageLabel,
                })}
                className="h-10 w-auto min-w-36 shrink-0 gap-1.5 rounded-lg bg-background px-3 data-[size=default]:h-10"
              >
                <SelectValue>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <LanguagesIcon
                      aria-hidden="true"
                      className="size-4 shrink-0"
                    />
                    <span
                      className="max-w-40 truncate"
                      title={selectedLanguageLabel}
                    >
                      {selectedLanguageLabel}
                    </span>
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={STORE_ALL_LANGUAGES}>
                  {t("allLanguages")}
                </SelectItem>
                {languages.map((language) => (
                  <SelectItem key={language} value={language}>
                    {languageLabel(language)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
        <StoreChannelTabs
          activeChannel={activeChannel}
          channels={channels}
          onSelect={(channel) => setChannelParam(channel ?? null)}
        />
      </div>

      {visible.length === 0 ? (
        <StoreMessage icon={<SearchIcon />} text={t("noResults")}>
          <Button
            onClick={() => {
              setQuery(null)
              setChannelParam(null)
              setLanguageParam(STORE_ALL_LANGUAGES)
            }}
            type="button"
            variant="outline"
          >
            {t("clearSearch")}
          </Button>
        </StoreMessage>
      ) : (
        <div className={STORE_SECTIONS_CLASS_NAME}>
          <StoreCategorySections
            categories={categories}
            gridClassName={layoutConfig.gridClassName}
            locale={viewerLocale}
            templates={primary}
            zone="primary"
          />
          {other.length > 0 ? (
            <section
              aria-label={t("otherLanguages")}
              className="flex flex-col gap-4"
            >
              {primary.length > 0 ? <hr className="border-border" /> : null}
              <OtherZoneHeading className="font-medium text-muted-foreground text-sm">
                {t("otherLanguages")}
              </OtherZoneHeading>
              <div className={STORE_SECTIONS_CLASS_NAME}>
                <StoreCategorySections
                  categories={categories}
                  gridClassName={layoutConfig.gridClassName}
                  locale={viewerLocale}
                  templates={other}
                  zone="other"
                />
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  )
}

/**
 * One zone of the store as category sections: each category is a titled grid,
 * the fullest first, the uncategorized ones last. A store with no categories
 * shows one plain grid. `zone` sets the titles' heading level and keeps their
 * ids unique across zones.
 */
function StoreCategorySections({
  templates,
  categories,
  locale,
  gridClassName,
  zone,
}: {
  templates: StoreCatalogTemplate[]
  categories: StoreCatalogCategory[]
  locale: string
  gridClassName: string
  zone: StoreZone
}) {
  const SectionHeading = STORE_ZONE_SECTION_HEADING_TAGS[zone]
  const t = useTranslations("templateStore.store")
  if (categories.length === 0) {
    return <StoreTemplateGrid className={gridClassName} templates={templates} />
  }
  const sections = groupStoreTemplatesByCategory(templates, categories, locale)
  return sections.map((section) => {
    const titleId = `store-${zone}-section-${section.key}`
    return (
      <section
        aria-labelledby={titleId}
        className="flex flex-col gap-4"
        key={section.key}
      >
        <SectionHeading
          className="font-semibold text-xl tracking-tight"
          id={titleId}
        >
          {section.category ? (
            <bdi>{section.category.name}</bdi>
          ) : (
            t("uncategorized")
          )}
        </SectionHeading>
        <StoreTemplateGrid
          className={gridClassName}
          templates={section.templates}
        />
      </section>
    )
  })
}

function StoreTemplateGrid({
  templates,
  className,
}: {
  templates: StoreCatalogTemplate[]
  className: string
}) {
  return (
    <ul className={className}>
      {templates.map((template) => (
        <li key={template.templateId}>
          <StoreTemplateCard template={template} />
        </li>
      ))}
    </ul>
  )
}

/**
 * One template: a tinted header with its channel icons on top, its name at the
 * bottom and its cover as a small illustration, then the description.
 */
function StoreTemplateCard({ template }: { template: StoreCatalogTemplate }) {
  return (
    <Link
      className="flex h-full flex-col rounded-xl border border-border/70 bg-card p-2 transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring"
      href={template.href}
    >
      <div className="relative flex min-h-28 items-stretch gap-3 overflow-hidden rounded-lg bg-muted/60 px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
          <TemplateChannelIcons
            channels={template.channels}
            className="gap-1.5"
            iconClassName="size-4"
            showGlobeWhenEvery
          />
          <p
            className="mt-auto line-clamp-2 break-words font-semibold text-[15px] text-foreground leading-snug"
            title={template.name}
          >
            <bdi>{template.name}</bdi>
          </p>
        </div>
        {/* biome-ignore lint/performance/noImgElement: external, unoptimized template thumbnail resolved from publisher-uploaded storage */}
        <img
          alt=""
          className="size-20 shrink-0 self-center rounded-lg object-cover"
          height={80}
          src={template.imageUrl}
          width={80}
        />
      </div>
      {template.description ? (
        // The padding sits on a wrapper: line-clamp clips at the padding box, so a padded clamped element would show the top of the next line.
        <div className="px-2 pt-2 pb-2">
          <p className="line-clamp-3 text-[13px] text-muted-foreground leading-snug">
            <bdi>{template.description}</bdi>
          </p>
        </div>
      ) : null}
    </Link>
  )
}

function StoreMessage({
  icon,
  text,
  children,
}: {
  icon: ReactNode
  text: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-background text-muted-foreground [&>svg]:size-5">
        {icon}
      </span>
      <p className="text-muted-foreground">{text}</p>
      {children}
    </div>
  )
}
