"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import type { FeedDraft } from "../lib/feed-draft"
import {
  FEED_MAX_AGE_HOURS_LIMIT,
  FEED_MAX_FILTER_TERMS,
} from "../lib/feed-options"

type TermsKey = "categoriesAny" | "excludeAny" | "includeAny"

/** A list of words typed one at a time (Enter or comma adds), shown as removable chips. */
const TermsInput = ({
  id,
  label,
  onChange,
  terms,
}: {
  id: string
  label: string
  onChange: (terms: string[]) => void
  terms: string[]
}) => {
  const [text, setText] = useState("")
  const add = () => {
    const term = text.trim()
    if (term && terms.length < FEED_MAX_FILTER_TERMS && !terms.includes(term)) {
      onChange([...terms, term])
    }
    setText("")
  }
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        maxLength={100}
        onBlur={add}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault()
            add()
          }
        }}
        value={text}
      />
      {terms.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {terms.map((term) => (
            <li key={term}>
              <Badge className="gap-1" variant="secondary">
                {term}
                <button
                  aria-label={term}
                  className="inline-flex"
                  onClick={() =>
                    onChange(terms.filter((entry) => entry !== term))
                  }
                  type="button"
                >
                  <XIcon className="size-3" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

const TERM_FIELDS: { key: TermsKey; label: string }[] = [
  { key: "includeAny", label: "posts.feeds.form.filterInclude" },
  { key: "excludeAny", label: "posts.feeds.form.filterExclude" },
  { key: "categoriesAny", label: "posts.feeds.form.filterCategories" },
]

/** Which items become posts: keyword and category chips, picture and age. */
export const FeedFilterFields = ({
  draft,
  onChange,
}: {
  draft: FeedDraft
  onChange: (patch: Partial<FeedDraft>) => void
}) => {
  const t = useTranslations()
  return (
    <fieldset className="space-y-3 rounded-lg border p-3">
      <legend className="px-1 font-medium text-sm">
        {t("posts.feeds.form.filtersTitle")}
      </legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {TERM_FIELDS.map(({ key, label }) => (
          <TermsInput
            id={`feed-${key}`}
            key={key}
            label={t(label)}
            onChange={(terms) => onChange({ [key]: terms })}
            terms={draft[key]}
          />
        ))}
        <div className="space-y-1">
          <Label htmlFor="feed-max-age">
            {t("posts.feeds.form.filterMaxAge")}
          </Label>
          <Input
            id="feed-max-age"
            inputMode="numeric"
            max={FEED_MAX_AGE_HOURS_LIMIT}
            min={1}
            onChange={(event) =>
              onChange({ maxAgeHours: event.target.value.replace(/\D/g, "") })
            }
            type="text"
            value={draft.maxAgeHours}
          />
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        {t("posts.feeds.form.filterTermsHelp")}
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input
          checked={draft.requireImage}
          onChange={(event) => onChange({ requireImage: event.target.checked })}
          type="checkbox"
        />
        {t("posts.feeds.form.filterRequireImage")}
      </label>
    </fieldset>
  )
}
