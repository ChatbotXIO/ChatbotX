"use client"

import type { TemplateStoreCandidate } from "@chatbotx.io/business"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@chatbotx.io/ui/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { useDebouncedCallback } from "@chatbotx.io/ui/hooks/use-debounced-callback"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { ChevronsUpDown } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import type { TemplateStoreScope } from "../schema"
import { searchTemplateStoreCandidatesAction } from "../template-store.action"

const SEARCH_DEBOUNCE_MS = 300

type TemplatePickerProps = {
  scope: TemplateStoreScope
  value: TemplateStoreCandidate | null
  onChange: (template: TemplateStoreCandidate | null) => void
}

/**
 * Picks one template that can still be added to the store: search by name, or
 * paste a Template ID. Only a bounded page of matches is ever loaded.
 */
export function TemplatePicker({
  scope,
  value,
  onChange,
}: TemplatePickerProps) {
  const t = useTranslations("templateStore.picker")
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState("")
  const [debouncedKeyword, setDebouncedKeyword] = useState("")
  const applyKeyword = useDebouncedCallback(
    setDebouncedKeyword,
    SEARCH_DEBOUNCE_MS,
  )

  const search = useQuery({
    queryKey: ["templateStoreCandidates", scope, debouncedKeyword],
    queryFn: async (): Promise<TemplateStoreCandidate[]> => {
      const result = await searchTemplateStoreCandidatesAction({
        scope,
        keyword: debouncedKeyword || undefined,
      })
      if (!result?.data) {
        throw new Error(result?.serverError ?? "search failed")
      }
      return result.data
    },
    enabled: open,
    // Never reuse an earlier answer: adding or removing a template changes who is addable.
    staleTime: 0,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  })

  const choose = (template: TemplateStoreCandidate) => {
    onChange(template)
    setOpen(false)
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            className="w-full min-w-0 justify-between font-normal"
            type="button"
            variant="outline"
          >
            <span
              className={value ? "truncate" : "truncate text-muted-foreground"}
            >
              {value?.name ?? t("placeholder")}
            </span>
            <ChevronsUpDown
              aria-hidden
              className="ms-2 size-4 shrink-0 opacity-50"
            />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-[var(--anchor-width)] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            onValueChange={(next) => {
              setKeyword(next)
              applyKeyword(next.trim())
            }}
            placeholder={t("search")}
            value={keyword}
          />
          <CommandList>
            {search.isError ? (
              <div className="space-y-2 p-4 text-center text-xs">
                <p className="text-destructive">{t("error")}</p>
                <Button
                  onClick={() => search.refetch()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {t("retry")}
                </Button>
              </div>
            ) : (
              <>
                {search.isFetched && search.data?.length === 0 ? (
                  <CommandEmpty>{t("empty")}</CommandEmpty>
                ) : null}
                <CommandGroup>
                  {search.data?.map((template) => (
                    <CommandItem
                      className="flex-col items-start gap-0.5"
                      key={template.templateId}
                      onSelect={() => choose(template)}
                      value={template.templateId}
                    >
                      <span className="w-full truncate font-medium">
                        {template.name}
                      </span>
                      <span className="w-full truncate text-muted-foreground text-xs">
                        {t("meta", {
                          id: template.templateId,
                          workspace: template.ownerWorkspaceName,
                        })}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
