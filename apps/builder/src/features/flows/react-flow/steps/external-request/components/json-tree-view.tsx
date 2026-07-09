"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { buildDotPropPath, type JsonPathSegment } from "./json-path"

const DEFAULT_MAX_DEPTH = 6
const MAX_VISIBLE_CHILDREN = 100

type JsonTreeViewProps = {
  data: unknown
  onSelectPath: (path: string) => void
  maxDepth?: number
}

const formatPrimitive = (value: unknown): string => {
  if (value === null) {
    return "null"
  }
  if (typeof value === "string") {
    return `"${value}"`
  }
  return String(value)
}

const isExpandable = (
  value: unknown,
): value is Record<string, unknown> | unknown[] =>
  typeof value === "object" && value !== null

export const JsonTreeView = ({
  data,
  onSelectPath,
  maxDepth = DEFAULT_MAX_DEPTH,
}: JsonTreeViewProps) => (
  <div className="flex flex-col gap-0.5 font-mono text-xs">
    <JsonTreeNode
      depth={0}
      label={null}
      maxDepth={maxDepth}
      onSelectPath={onSelectPath}
      segments={[]}
      value={data}
    />
  </div>
)

type JsonTreeNodeProps = {
  label: string | number | null
  value: unknown
  segments: JsonPathSegment[]
  depth: number
  maxDepth: number
  onSelectPath: (path: string) => void
}

const JsonTreeNode = ({
  label,
  value,
  segments,
  depth,
  maxDepth,
  onSelectPath,
}: JsonTreeNodeProps) => {
  const t = useTranslations()
  const [expanded, setExpanded] = useState(depth < 1)
  const [showAllChildren, setShowAllChildren] = useState(false)

  const path = buildDotPropPath(segments)

  if (!isExpandable(value)) {
    return (
      <div className="flex items-center gap-1 pl-4">
        {label !== null && (
          <button
            className="cursor-pointer truncate text-left text-foreground hover:underline"
            onClick={() => onSelectPath(path)}
            type="button"
          >
            {label}
          </button>
        )}
        <span className="text-muted-foreground">
          {label === null ? "" : ": "}
          {formatPrimitive(value)}
        </span>
      </div>
    )
  }

  const entries: [string | number, unknown][] = Array.isArray(value)
    ? value.map((item, index) => [index, item])
    : Object.entries(value)

  if (depth >= maxDepth) {
    return (
      <div className="flex items-center gap-1 pl-4">
        {label !== null && (
          <button
            className="cursor-pointer truncate text-left text-foreground hover:underline"
            onClick={() => onSelectPath(path)}
            type="button"
          >
            {label}
          </button>
        )}
        <button
          className="text-muted-foreground italic hover:underline"
          onClick={() => setExpanded(true)}
          type="button"
        >
          {t("fields.jsonSource.showMore")}
        </button>
      </div>
    )
  }

  const visibleEntries = showAllChildren
    ? entries
    : entries.slice(0, MAX_VISIBLE_CHILDREN)
  const hiddenCount = entries.length - visibleEntries.length

  return (
    <div className={cn(depth > 0 && "pl-4")}>
      <div className="flex items-center gap-1">
        <button
          aria-label={expanded ? t("actions.collapse") : t("actions.expand")}
          className="flex size-4 shrink-0 items-center justify-center text-muted-foreground"
          onClick={() => setExpanded((prev) => !prev)}
          type="button"
        >
          {expanded ? (
            <ChevronDownIcon size={12} />
          ) : (
            <ChevronRightIcon size={12} />
          )}
        </button>
        {label === null ? (
          <span className="text-muted-foreground">
            {Array.isArray(value) ? "[ ]" : "{ }"}
          </span>
        ) : (
          <button
            className="cursor-pointer truncate text-left text-foreground hover:underline"
            onClick={() => onSelectPath(path)}
            type="button"
          >
            {label}
          </button>
        )}
      </div>

      {expanded && (
        <div className="flex flex-col gap-0.5">
          {visibleEntries.map(([key, childValue]) => (
            <JsonTreeNode
              depth={depth + 1}
              key={key}
              label={key}
              maxDepth={maxDepth}
              onSelectPath={onSelectPath}
              segments={[...segments, key]}
              value={childValue}
            />
          ))}
          {hiddenCount > 0 && (
            <button
              className="pl-4 text-left text-muted-foreground italic hover:underline"
              onClick={() => setShowAllChildren(true)}
              type="button"
            >
              {t("fields.jsonSource.showMoreCount", { count: hiddenCount })}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
