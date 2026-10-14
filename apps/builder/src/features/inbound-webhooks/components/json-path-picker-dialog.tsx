"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  formatJsonPath,
  type JsonPathEntry,
  listJsonPathEntries,
  parseJsonPath,
} from "@chatbotx.io/utils/json-path"
import { SearchIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { JsonTreeView } from "@/features/flows/react-flow/steps/external-request/components/json-tree-view"
import { JsonPathPreview } from "./json-path-preview"

const MAX_SEARCH_RESULTS = 200

type JsonPathPickerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** What is being picked, e.g. "Phone" or "Mapping 1". */
  title: string
  sample: unknown
  initialPath: string
  onSelect: (path: string) => void
}

/** Entries whose path (so their keys) or value contains the query; the root is never a value. */
export const filterJsonPathEntries = (
  entries: readonly JsonPathEntry[],
  query: string,
): JsonPathEntry[] => {
  const needle = query.trim().toLowerCase()
  return entries.filter(
    ({ segments, path, preview }) =>
      segments.length > 0 &&
      (path.toLowerCase().includes(needle) ||
        (preview?.toLowerCase().includes(needle) ?? false)),
  )
}

/** Mounted only while open, so the path input always starts from the current value. */
export const JsonPathPickerDialog = ({
  open,
  onOpenChange,
  title,
  sample,
  initialPath,
  onSelect,
}: JsonPathPickerDialogProps) => {
  const t = useTranslations("inboundWebhooks.picker")
  const [path, setPath] = useState(initialPath)
  const [query, setQuery] = useState("")
  const hasSample = typeof sample === "object" && sample !== null

  const listing = useMemo(
    () => (hasSample ? listJsonPathEntries(sample) : null),
    [hasSample, sample],
  )
  const matches = useMemo(
    () =>
      listing && query.trim()
        ? filterJsonPathEntries(listing.entries, query)
        : [],
    [listing, query],
  )

  // `$` alone is the whole payload, which is not a value a field can read.
  const segments = path.trim() ? parseJsonPath(path) : null
  const canonicalPath =
    segments && segments.length > 0 ? formatJsonPath(segments) : null
  const isPathInvalid = path.trim() !== "" && canonicalPath === null

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute start-3 top-2.5 size-4 text-muted-foreground"
          />
          <Input
            aria-label={t("searchLabel")}
            className="ps-9"
            disabled={!hasSample}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            type="search"
            value={query}
          />
        </div>

        <div className="max-h-72 overflow-auto rounded-md border p-3">
          {hasSample ? (
            <PickerBody
              matches={matches}
              onSelectPath={setPath}
              query={query}
              sample={sample}
              truncated={listing?.truncated ?? false}
            />
          ) : (
            <p className="text-muted-foreground text-sm">{t("noSample")}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Input
            aria-invalid={isPathInvalid}
            aria-label={t("pathLabel")}
            className="font-mono text-xs"
            onChange={(event) => setPath(event.target.value)}
            placeholder="$.customer.email"
            value={path}
          />
          <p
            className={
              isPathInvalid
                ? "text-destructive text-xs"
                : "text-muted-foreground text-xs"
            }
            role={isPathInvalid ? "alert" : undefined}
          >
            {isPathInvalid ? t("invalidPath") : t("pathHint")}
          </p>
          <JsonPathPreview path={canonicalPath ?? ""} sample={sample} />
        </div>

        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="ghost"
          >
            {t("cancel")}
          </Button>
          <Button
            disabled={!canonicalPath}
            onClick={() => {
              if (canonicalPath) {
                onSelect(canonicalPath)
                onOpenChange(false)
              }
            }}
            type="button"
          >
            {t("use")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type PickerBodyProps = {
  sample: unknown
  query: string
  matches: JsonPathEntry[]
  truncated: boolean
  onSelectPath: (path: string) => void
}

const PickerBody = ({
  sample,
  query,
  matches,
  truncated,
  onSelectPath,
}: PickerBodyProps) => {
  const t = useTranslations("inboundWebhooks.picker")
  if (!query.trim()) {
    return (
      <JsonTreeView
        data={sample}
        formatPath={formatJsonPath}
        onSelectPath={onSelectPath}
        rootLabel="$"
      />
    )
  }
  if (matches.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("noMatches")}</p>
  }
  return (
    <ul className="flex flex-col gap-1 font-mono text-xs">
      {matches.slice(0, MAX_SEARCH_RESULTS).map((entry) => (
        <li key={entry.path}>
          <button
            className="flex w-full cursor-pointer flex-col items-start gap-0.5 rounded px-2 py-1 text-start hover:bg-muted"
            onClick={() => onSelectPath(entry.path)}
            type="button"
          >
            <span className="break-all text-foreground">{entry.path}</span>
            {entry.preview === null ? null : (
              <span className="break-all text-muted-foreground">
                {entry.preview}
              </span>
            )}
          </button>
        </li>
      ))}
      {matches.length > MAX_SEARCH_RESULTS || truncated ? (
        <li className="px-2 py-1 font-sans text-muted-foreground italic">
          {t("moreResults", {
            count: Math.min(matches.length, MAX_SEARCH_RESULTS),
          })}
        </li>
      ) : null}
    </ul>
  )
}
