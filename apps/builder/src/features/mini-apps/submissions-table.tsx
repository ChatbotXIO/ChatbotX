"use client"

import type { MiniAppDefinition } from "@chatbotx.io/mini-app"
import {
  isFileAnswer,
  MINI_APP_COMPONENTS,
  type MiniAppFileAnswer,
  walkNodes,
} from "@chatbotx.io/mini-app"
import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { FileTextIcon } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { use, useMemo } from "react"
import { SubmissionContactCell } from "./components/submission-contact-cell"
import type { listMiniAppSubmissions } from "./queries"

type SubmissionsResponse = Awaited<ReturnType<typeof listMiniAppSubmissions>>
type SubmissionRow = SubmissionsResponse["data"][number]

/** Input name → its label (and option titles), so answers read like the form. */
const buildFieldIndex = (definition: MiniAppDefinition) => {
  const fields: {
    name: string
    label: string
    options: Map<string, string>
  }[] = []
  for (const screen of definition.screens) {
    walkNodes(screen.children, ({ node }) => {
      const name = node.props.name
      if (
        !(MINI_APP_COMPONENTS[node.type].isInput && typeof name === "string")
      ) {
        return
      }
      const options = new Map<string, string>()
      const dataSource = node.props["data-source"]
      if (Array.isArray(dataSource)) {
        for (const option of dataSource as { id: string; title: string }[]) {
          options.set(option.id, option.title)
        }
      }
      const label =
        typeof node.props.label === "string" ? node.props.label : name
      fields.push({ name, label, options })
    })
  }
  return fields
}

/** Thumbnails for photos, file names for documents — each opens the public URL. */
function FileAnswerCell({ files }: { files: MiniAppFileAnswer[] }) {
  return (
    <div className="flex max-w-[240px] flex-wrap items-center gap-1">
      {files.map((file) =>
        file.mimeType.startsWith("image/") ? (
          <a
            href={file.url}
            key={file.uploadId}
            rel="noopener noreferrer"
            target="_blank"
            title={file.name}
          >
            {/* biome-ignore lint/performance/noImgElement: visitor-uploaded file on storage */}
            <img
              alt={file.name}
              className="size-10 rounded border object-cover"
              height={40}
              src={file.url}
              width={40}
            />
          </a>
        ) : (
          <a
            className="flex max-w-[200px] items-center gap-1 truncate text-primary text-sm hover:underline"
            href={file.url}
            key={file.uploadId}
            rel="noopener noreferrer"
            target="_blank"
          >
            <FileTextIcon className="size-3.5 shrink-0" />
            <span className="truncate">{file.name}</span>
          </a>
        ),
      )}
    </div>
  )
}

export function SubmissionsTable({
  workspaceId,
  definition,
  promises,
}: {
  workspaceId: string
  definition: MiniAppDefinition
  promises: Promise<[SubmissionsResponse]>
}) {
  const t = useTranslations()
  const format = useFormatter()
  const [{ data, pageCount }] = use(promises)
  const fields = useMemo(() => buildFieldIndex(definition), [definition])

  const columns = useMemo<ColumnDef<SubmissionRow>[]>(() => {
    const formatAnswer = (
      value: unknown,
      options: Map<string, string>,
    ): string => {
      if (Array.isArray(value)) {
        return value
          .map((item) => options.get(String(item)) ?? String(item))
          .join(", ")
      }
      if (typeof value === "boolean") {
        return value
          ? t("miniApps.submissions.yes")
          : t("miniApps.submissions.no")
      }
      if (value && typeof value === "object") {
        return Object.values(value).join(" → ")
      }
      return value === undefined || value === null
        ? ""
        : (options.get(String(value)) ?? String(value))
    }
    return [
      {
        id: "createdAt",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("miniApps.submissions.submittedAt")}
          />
        ),
        cell: ({ row }) =>
          format.dateTime(new Date(row.original.createdAt), {
            dateStyle: "medium",
            timeStyle: "short",
          }),
        enableSorting: false,
      },
      {
        id: "contact",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("miniApps.submissions.contact")}
          />
        ),
        cell: ({ row }) =>
          row.original.contact ? (
            <SubmissionContactCell
              contact={row.original.contact}
              workspaceId={workspaceId}
            />
          ) : (
            <span className="text-muted-foreground">
              {t("miniApps.submissions.anonymous")}
            </span>
          ),
        enableSorting: false,
      },
      ...fields.map(
        (field): ColumnDef<SubmissionRow> => ({
          id: `answer:${field.name}`,
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title={field.label} />
          ),
          cell: ({ row }) => {
            const answer = (row.original.answers as Record<string, unknown>)[
              field.name
            ]
            return isFileAnswer(answer) ? (
              <FileAnswerCell files={answer} />
            ) : (
              <span className="line-clamp-2 max-w-[240px]">
                {formatAnswer(answer, field.options)}
              </span>
            )
          },
          enableSorting: false,
        }),
      ),
    ]
  }, [t, format, fields, workspaceId])

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    getRowId: (row) => row.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <Card>
      <CardContent>
        <DataTable table={table} />
      </CardContent>
    </Card>
  )
}
