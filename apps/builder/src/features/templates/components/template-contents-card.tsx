"use client"

import type { TemplateCategory } from "@chatbotx.io/database/partials"
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
import type {
  CategorySelectionState,
  TemplateSelectionFormState,
} from "../lib/selection"
import { selectionCount } from "../lib/selection"
import { CategoryResourceList } from "./category-resource-list"

/**
 * Categories with a working `listSelectableResources` collector +
 * snapshot-service `mode:"all"` resolver. The rest render a disabled row
 * with a "coming soon" note rather than a broken picker — see
 * `snapshot.service.ts`'s `resolveSelectionIds` TODO for the matching
 * backend gap.
 */
const AVAILABLE_CATEGORIES: readonly TemplateCategory[] = [
  "flows",
  "tags",
  "customFields",
]

const ALL_CATEGORIES: readonly TemplateCategory[] = [
  "flows",
  "customFields",
  "tags",
  "products",
  "productCategories",
  "aiFunctions",
  "aiAgents",
  "calendars",
  "webchats",
  "keywords",
  "entryPointLinks",
  "triggers",
  "fbCommentAutomations",
  "settings",
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("templates.form.contents")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion>
          {ALL_CATEGORIES.map((category) => {
            const isAvailable = AVAILABLE_CATEGORIES.includes(category)
            const count = selectionCount(selection[category])
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
                  <AccordionContent>
                    <CategoryResourceList
                      category={category}
                      onChange={(next) => onChange(category, next)}
                      selection={
                        selection[category] ?? { mode: "ids", ids: [] }
                      }
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
