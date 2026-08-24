"use client"

import type { TemplateCategory } from "@chatbotx.io/database/partials"
import {
  templateCategories,
  templateResourceCategories,
} from "@chatbotx.io/database/partials"
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
 * Categories with a working `listSelectableResources` picker query +
 * `ResourceCollector.resolveIds`/`collect` — derived from
 * `templateResourceCategories` (`packages/database/src/partials/template.ts`)
 * so this list cannot drift from the adapter registry it mirrors: every
 * resource category has an adapter (`registry.ts`'s
 * `satisfies Record<TemplateResourceCategory, ResourceAdapter>` with no
 * `Partial` guarantees that at compile time), so every resource category is
 * available here too. `tags`/`customFields` are added on top since those two
 * manifest-only categories also have their own picker + ownership check
 * (`snapshot.service.ts`'s inline `assertIdsBelongToWorkspace` path).
 * `productCategories` stays excluded — it is never independently selectable;
 * a product's category comes along automatically via `productsAdapter`'s
 * collector.
 */
const AVAILABLE_CATEGORIES: readonly TemplateCategory[] = [
  ...templateResourceCategories.options,
  "tags",
  "customFields",
]

const ALL_CATEGORIES: readonly TemplateCategory[] = templateCategories.options

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
