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
import { useQuery } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { orpc } from "@/lib/orpc/query"
import type {
  CategorySelectionState,
  TemplateSelectionFormState,
} from "../lib/selection"
import { EMPTY_SELECTION, selectionCount } from "../lib/selection"
import { useDebouncedValue } from "../lib/use-debounced-value"
import { CategoryResourceList } from "./category-resource-list"
import { IncludedAutomatically } from "./included-automatically"

const DEPENDENCY_DEBOUNCE_MS = 600

const hasSelectedAnything = (selection: TemplateSelectionFormState) =>
  Object.values(selection).some((chosen) =>
    chosen?.mode === "all" ? true : (chosen?.ids.length ?? 0) > 0,
  )

type TemplateContentsCardProps = {
  workspaceId: string
  categories: readonly TemplateCategory[]
  selection: TemplateSelectionFormState
  onChange: (category: TemplateCategory, next: CategorySelectionState) => void
}

export function TemplateContentsCard({
  workspaceId,
  categories,
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

  // Read-only: what saving this selection takes along by itself. Debounced
  // because every checkbox tick changes the selection.
  const debouncedSelection = useDebouncedValue(
    selection,
    DEPENDENCY_DEBOUNCE_MS,
  )
  const dependencies = useQuery({
    ...orpc.templatesAPI.previewDependenciesAPI.queryOptions({
      input: { workspaceId, selection: debouncedSelection },
    }),
    enabled: hasSelectedAnything(debouncedSelection),
    retry: false,
  })
  const manifestKinds = useMemo(() => new Set<string>(categories), [categories])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("templates.form.contents")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion>
          {categories.map((category) => {
            const count = selectionCount(
              selection[category],
              totalHints[category],
            )
            return (
              <AccordionItem key={category} value={category}>
                <AccordionTrigger>
                  <span className="flex flex-1 items-center justify-between pe-2">
                    <span>{t(`templates.categories.${category}`)}</span>
                    {count > 0 && <Badge variant="secondary">{count}</Badge>}
                  </span>
                </AccordionTrigger>
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
                  <IncludedAutomatically
                    category={category}
                    dependencies={dependencies.data}
                  />
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>
        {/* The save would refuse the same selection: say why while picking. */}
        {errorCodeOf(dependencies.error) === "templateIncludesViewOnlyCopy" ? (
          <p className="mt-3 text-destructive text-sm" role="alert">
            {t("templates.form.viewOnlyCopyIncluded")}
          </p>
        ) : null}
        <IncludedAutomatically
          dependencies={dependencies.data}
          excludeKinds={manifestKinds}
        />
      </CardContent>
    </Card>
  )
}

const errorCodeOf = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined
