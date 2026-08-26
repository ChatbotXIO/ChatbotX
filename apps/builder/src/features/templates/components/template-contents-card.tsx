"use client"

import type { TemplateCategory } from "@chatbotx.io/database/partials"
import { templateCategories } from "@chatbotx.io/database/partials"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@chatbotx.io/ui/components/ui/accordion"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { useTranslations } from "next-intl"
import { useState } from "react"
import type {
  CategorySelectionState,
  TemplateSelectionFormState,
} from "../lib/selection"
import { EMPTY_SELECTION, selectionCount } from "../lib/selection"
import { CategoryResourceList } from "./category-resource-list"

/**
 * Categories currently exposed for sharing. This is a deliberate **product**
 * restriction, not a technical one: every category in `ALL_CATEGORIES` still
 * has a working adapter and picker query (`registry.ts` enforces adapter
 * completeness at compile time via
 * `satisfies Record<TemplateResourceCategory, ResourceAdapter>`), so the rest
 * are fully implemented — they are just held back from the share flow for now
 * and render disabled with a "Coming soon" badge.
 *
 * Kept as an explicit list rather than derived from
 * `templateResourceCategories` so that narrowing what users can share never
 * requires touching the enum: that enum feeds a `pgEnum`
 * (`schema/template-installed-resource.ts`) and the adapter registry, so
 * editing it to gate the UI breaks the build and drifts from the database.
 * To release a category, add it back to this array — nothing else.
 *
 * `productCategories` is excluded for a different, permanent reason: it is
 * never independently selectable — a product's category comes along
 * automatically via `productsAdapter`'s collector.
 */
const AVAILABLE_CATEGORIES: readonly TemplateCategory[] = [
  "flows",
  "tags",
  "customFields",
]

/**
 * Display order: the available categories first, in the order above, then
 * every remaining category. The tail is derived from `templateCategories`
 * rather than hand-listed so a newly added category still shows up here (as
 * "Coming soon") instead of silently vanishing from the form.
 */
const ALL_CATEGORIES: readonly TemplateCategory[] = [
  ...AVAILABLE_CATEGORIES,
  ...templateCategories.options.filter(
    (category) => !AVAILABLE_CATEGORIES.includes(category),
  ),
]

type TemplateContentsCardProps = {
  workspaceId: string
  selection: TemplateSelectionFormState
  onChange: (category: TemplateCategory, next: CategorySelectionState) => void
}

export function TemplateContentsCard({
  workspaceId,
  selection,
  onChange,
}: TemplateContentsCardProps) {
  const t = useTranslations()
  // Populated from each category's own fetch, so `mode:"all"` can render
  // "All (N)" instead of a blank badge (`selectionCount` needs a totalHint
  // to know what "all" resolves to on the server).
  const [totalHints, setTotalHints] = useState<
    Partial<Record<TemplateCategory, number>>
  >({})

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("templates.form.contents")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion>
          {ALL_CATEGORIES.map((category) => {
            const isAvailable = AVAILABLE_CATEGORIES.includes(category)
            const count = selectionCount(
              selection[category],
              totalHints[category],
            )
            return (
              <AccordionItem key={category} value={category}>
                <AccordionTrigger disabled={!isAvailable}>
                  <span className="flex flex-1 items-center justify-between pr-2">
                    <span>{t(`templates.categories.${category}`)}</span>
                    {isAvailable ? (
                      count > 0 && <Badge variant="secondary">{count}</Badge>
                    ) : (
                      <Badge variant="outline">
                        {t("templates.form.comingSoon")}
                      </Badge>
                    )}
                  </span>
                </AccordionTrigger>
                {isAvailable ? (
                  <AccordionContent keepMounted>
                    <CategoryResourceList
                      category={category}
                      onChange={(next) => onChange(category, next)}
                      onTotalChange={(total) =>
                        setTotalHints((current) =>
                          current[category] === total
                            ? current
                            : { ...current, [category]: total },
                        )
                      }
                      selection={selection[category] ?? EMPTY_SELECTION}
                      workspaceId={workspaceId}
                    />
                  </AccordionContent>
                ) : null}
              </AccordionItem>
            )
          })}
        </Accordion>
      </CardContent>
    </Card>
  )
}
