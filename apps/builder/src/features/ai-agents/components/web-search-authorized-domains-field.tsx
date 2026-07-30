"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { InfoIcon, PlusIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useEffect } from "react"
import { useFieldArray, useFormContext, useWatch } from "react-hook-form"
import {
  isWebSearchSelected,
  MAX_WEB_SEARCH_AUTHORIZED_DOMAINS,
} from "../lib/web-search-tool"

export function WebSearchAuthorizedDomainsField() {
  const t = useTranslations()
  const { control } = useFormContext()
  const tools = useWatch({ control, name: "tools" }) as string[] | undefined
  const {
    fields: authorizedDomains,
    append,
    remove,
    replace,
  } = useFieldArray({
    control,
    name: "webSearchAuthorizedDomains",
  })

  const hasWebSearch = isWebSearchSelected(tools)
  const hasReachedLimit =
    authorizedDomains.length >= MAX_WEB_SEARCH_AUTHORIZED_DOMAINS

  useEffect(() => {
    if (!hasWebSearch && authorizedDomains.length > 0) {
      replace([])
    }
  }, [authorizedDomains.length, hasWebSearch, replace])

  const handleAddDomain = useCallback(() => {
    if (!hasReachedLimit) {
      append({ value: "" })
    }
  }, [append, hasReachedLimit])

  if (!hasWebSearch) {
    return null
  }

  return (
    <div className="space-y-4 rounded-md border border-input p-4">
      <div className="flex items-center gap-2">
        <Label htmlFor="webSearchAuthorizedDomains">
          {t("fields.webSearchAuthorizedDomains.label")}
        </Label>
        <Tooltip>
          <TooltipTrigger
            render={
              <InfoIcon
                aria-label={t("fields.webSearchAuthorizedDomains.tooltip")}
                className="size-4 text-muted-foreground"
              />
            }
          />
          <TooltipContent className="max-w-sm">
            {t("fields.webSearchAuthorizedDomains.tooltip")}
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="space-y-2">
        {authorizedDomains.map((field, index) => (
          <div className="flex gap-2" key={field.id}>
            <InputField
              name={`webSearchAuthorizedDomains.${index}.value`}
              placeholder={t("fields.webSearchAuthorizedDomains.placeholder")}
            />

            <Button
              aria-label={t("actions.delete")}
              onClick={() => remove(index)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <XIcon aria-hidden className="size-4" />
            </Button>
          </div>
        ))}
      </div>

      <Button
        className="w-full"
        disabled={hasReachedLimit}
        onClick={handleAddDomain}
        type="button"
        variant="outline"
      >
        <PlusIcon aria-hidden className="size-4" />
        {t("actions.addNew")}
      </Button>
    </div>
  )
}
