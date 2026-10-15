"use client"

import {
  flattenNodes,
  inputName,
  isFileAnswer,
  type MiniAppDefinition,
  type MiniAppFileAnswer,
  type MiniAppOption,
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
import { readArray, readString } from "./lib/props"
import type { listMiniAppSubmissions } from "./queries"

type SubmissionsResponse = Awaited<ReturnType<typeof listMiniAppSubmissions>>
type SubmissionRow = SubmissionsResponse["data"][number]

type FieldColumn = { name: string; label: string; options: Map<string, string> }

/** Input name → its label (and option titles), so answers read like the form. */
const buildFieldIndex = (definition: MiniAppDefinition): FieldColumn[] =>
  definition.screens
    .flatMap((screen) => flattenNodes(screen.children))
    .flatMap((node) => {
      const name = inputName(node)
      if (!name) {
        return []
      }
      const options = readArray<MiniAppOption>(node.props["data-source"])
      return [
        {
          name,
          label: readString(node.props.label) || name,
          options: new Map(options.map((option) => [option.id, option.title])),
        },
      ]
    })

/** An answer as text: option titles for ids, a yes/no word for a boolean, `a → b` for a range. */
const formatAnswer = (
  value: unknown,
  options: Map<string, string>,
  yesNo: { yes: string; no: string },
): string => {
  if (Array.isArray(value)) {
    return value
      .map((item) => options.get(String(item)) ?? String(item))
      .join(", ")
  }
  if (typeof value === "boolean") {
    return value ? yesNo.yes : yesNo.no
  }
  if (value && typeof value === "object") {
    return Object.values(value).join(" → ")
  }
  return value === undefined || value === null
    ? ""
    : (options.get(String(value)) ?? String(value))
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
    const yesNo = {
      yes: t("miniApps.submissions.yes"),
      no: t("miniApps.submissions.no"),
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
                {formatAnswer(answer, field.options, yesNo)}
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
