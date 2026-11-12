"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { SearchIcon, StoreIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { parseAsString, useQueryState } from "nuqs"
import type { ReactNode } from "react"
import {
  filterStoreTemplates,
  type StoreCatalogCategory,
  type StoreCatalogTemplate,
  shouldShowCategoryFilter,
} from "../lib/filter-store-templates"

/** What every layout shares; the variant only adds the page chrome around it. */
const STORE_CATALOG_BASE_CLASS_NAME = "flex w-full flex-col gap-8"

type StoreCatalogHeadingTag = "h1" | "h2"

type StoreCatalogLayoutConfig = {
  /** The page's own title is an h1; under another page's h1 it is an h2. */
  headingTag: StoreCatalogHeadingTag
  headingClassName: string
  className: string
  gridClassName: string
}

/**
 * Both layouts share the store header: the title and tagline on the left, the
 * search on the right, the category chips below. `page` is the public `/store`
 * page, so its title is the page's h1 and the grid follows the window width.
 * `embedded` is a tab of the home page, so its title is a smaller h2 under
 * the page's welcome heading, and the grid follows the width of its own
 * container (the account rail takes part of the window): as many columns as
 * fit cards of at least 17rem.
 */
const STORE_CATALOG_LAYOUTS = {
  page: {
    headingTag: "h1",
    headingClassName: "font-bold text-3xl tracking-tight sm:text-4xl",
    className: "mx-auto max-w-6xl pt-4 sm:pt-10",
    gridClassName: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
  },
  embedded: {
    headingTag: "h2",
    headingClassName: "font-semibold text-lg tracking-tight sm:text-xl",
    className: "",
    gridClassName:
      "grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-5",
  },
} as const satisfies Record<string, StoreCatalogLayoutConfig>

type StoreCatalogLayout = keyof typeof STORE_CATALOG_LAYOUTS

type StoreCatalogProps = {
  tenantName: string
  categories: StoreCatalogCategory[]
  templates: StoreCatalogTemplate[]
  layout?: StoreCatalogLayout
}

/**
 * The catalog is loaded whole, so searching and switching category only
 * change the URL in the browser: `shallow` keeps the server page from running
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
 * The template store: a heading with search, one chip per category (with
 * its template count) and a card per template. The whole catalog is loaded
 * once (it is capped per tenant), so switching category and searching are
 * client-side. Both live in the URL, so a view can be shared.
 */
export function StoreCatalog({
  tenantName,
  categories,
  templates,
  layout = "page",
}: StoreCatalogProps) {
  const t = useTranslations("templateStore.store")
  const tTitle = useTranslations("templateStore")
  const layoutConfig = STORE_CATALOG_LAYOUTS[layout]
  const Heading = layoutConfig.headingTag
  const [categoryParam, setCategoryParam] = useQueryState(
    "category",
    parseAsString.withOptions(STORE_URL_STATE_OPTIONS),
  )
  const [query, setQuery] = useQueryState(
    "q",
    parseAsString.withDefault("").withOptions(STORE_URL_STATE_OPTIONS),
  )

  if (templates.length === 0) {
    return <StoreMessage icon={<StoreIcon />} text={t("empty")} />
  }

  const showCategoryFilter = shouldShowCategoryFilter({ categories, templates })

  // No category (or an unknown or stale one in the URL) means every template.
  const activeCategory = showCategoryFilter
    ? categories.find((category) => category.id === categoryParam)
    : undefined
  const visible = filterStoreTemplates({
    templates,
    categoryId: activeCategory?.id,
    query,
  })
  const publisherOf = (template: StoreCatalogTemplate): string =>
    template.publisherName ?? tenantName
  const countInCategory = (categoryId: string): number =>
    templates.filter((template) => template.categoryIds.includes(categoryId))
      .length

  return (
    <div className={cn(STORE_CATALOG_BASE_CLASS_NAME, layoutConfig.className)}>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Heading className={layoutConfig.headingClassName}>
            {tTitle("title")}
          </Heading>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="relative w-full sm:max-w-xs">
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
      </div>

      {showCategoryFilter ? (
        <fieldset className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0">
          <legend className="sr-only">{t("categories")}</legend>
          <CategoryChip
            count={templates.length}
            isActive={activeCategory === undefined}
            label={t("all")}
            onSelect={() => setCategoryParam(null)}
          />
          {categories.map((category) => (
            <CategoryChip
              count={countInCategory(category.id)}
              isActive={category.id === activeCategory?.id}
              key={category.id}
              label={category.name}
              onSelect={() =>
                // Clicking the chosen category again clears the filter.
                setCategoryParam(
                  category.id === activeCategory?.id ? null : category.id,
                )
              }
            />
          ))}
        </fieldset>
      ) : null}

      {visible.length === 0 ? (
        <StoreMessage icon={<SearchIcon />} text={t("noResults")}>
          <Button
            onClick={() => setQuery(null)}
            type="button"
            variant="outline"
          >
            {t("clearSearch")}
          </Button>
        </StoreMessage>
      ) : (
        <ul className={layoutConfig.gridClassName}>
          {visible.map((template) => (
            <li key={template.templateId}>
              <Link
                className="flex h-full flex-col gap-4 rounded-2xl border bg-card p-5 shadow-xs transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring"
                href={template.href}
              >
                <div className="flex items-center gap-4">
                  {/* biome-ignore lint/performance/noImgElement: external, unoptimized template thumbnail resolved from publisher-uploaded storage */}
                  <img
                    alt=""
                    className="size-14 shrink-0 rounded-xl bg-white object-cover"
                    height={56}
                    src={template.imageUrl}
                    width={56}
                  />
                  <div className="min-w-0">
                    <p
                      className="line-clamp-2 break-words font-semibold leading-snug"
                      title={template.name}
                    >
                      {template.name}
                    </p>
                    <p
                      className="truncate text-muted-foreground text-sm"
                      title={publisherOf(template)}
                    >
                      {t("by", { publisherName: publisherOf(template) })}
                    </p>
                  </div>
                </div>
                {template.description ? (
                  <p className="line-clamp-3 text-muted-foreground text-sm">
                    {template.description}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CategoryChip({
  label,
  count,
  isActive,
  onSelect,
}: {
  label: string
  count: number
  isActive: boolean
  onSelect: () => void
}) {
  return (
    <Button
      aria-pressed={isActive}
      className="min-w-0 max-w-full rounded-full"
      onClick={onSelect}
      type="button"
      variant={isActive ? "default" : "outline"}
    >
      <span className="truncate" title={label}>
        {label}
      </span>
      <span
        className={cn(
          "shrink-0 text-xs tabular-nums",
          isActive ? "opacity-80" : "text-muted-foreground",
        )}
      >
        {count}
      </span>
    </Button>
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
