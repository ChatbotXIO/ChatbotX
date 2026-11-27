"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { BracesIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { FEED_TEMPLATE_VARIABLES } from "../lib/feed-options"

const MAX_SAMPLE_LENGTH = 40
const MAX_FIELDS_SHOWN = 40

const variable = (name: string): string => `{{ ${name} }}`
const rawField = (key: string): string => `{{ raw[${JSON.stringify(key)}] }}`

const sampleOf = (value: string | string[] | undefined): string => {
  const text = Array.isArray(value) ? value.join(", ") : (value ?? "")
  return text.length > MAX_SAMPLE_LENGTH
    ? `${text.slice(0, MAX_SAMPLE_LENGTH)}…`
    : text
}

/**
 * "Insert field": the variables every item has, then the raw fields found in
 * the feed's latest item with a sample of each. Picking one calls `onInsert`
 * with the template text (`{{ title }}` or `{{ raw["g:price"] }}`).
 */
export const FeedFieldMenu = ({
  fields,
  onInsert,
}: {
  fields: Record<string, string | string[]> | null
  onInsert: (text: string) => void
}) => {
  const t = useTranslations()
  const raw = fields ? Object.keys(fields).slice(0, MAX_FIELDS_SHOWN) : []
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button size="sm" type="button" variant="outline">
            <BracesIcon />
            {t("posts.feeds.form.templateInsert")}
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {t("posts.feeds.form.templateVariables")}
          </DropdownMenuLabel>
          {FEED_TEMPLATE_VARIABLES.map((name) => (
            <DropdownMenuItem
              key={name}
              onClick={() => onInsert(variable(name))}
            >
              <code className="text-xs">{name}</code>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        {raw.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                {t("posts.feeds.form.templateFeedFields")}
              </DropdownMenuLabel>
              {raw.map((key) => (
                <DropdownMenuItem
                  key={key}
                  onClick={() => onInsert(rawField(key))}
                >
                  <span className="flex min-w-0 flex-col">
                    <code className="truncate text-xs">{key}</code>
                    <span className="truncate text-muted-foreground text-xs">
                      {sampleOf(fields?.[key])}
                    </span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
