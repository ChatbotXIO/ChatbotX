"use client"

import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import { formatDate } from "@chatbotx.io/ui/lib/format"
import type { ColumnDef } from "@tanstack/react-table"
import { EllipsisVerticalIcon, Trash2Icon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { use, useMemo, useState } from "react"
import { getQuestionnaireSubmissionDetailAction } from "../actions/get-questionnaire-submission-detail.action"
import type { listQuestionnaireSubmissions } from "../queries"
import { ApplicantDetailModal } from "./applicant-detail-modal"
import { DeleteApplicantSubmissionDialog } from "./delete-applicant-submission-dialog"
import { QuestionnaireApplicantAvatarCell } from "./questionnaire-applicant-avatar-cell"
import { QuestionnaireApplicantsTableToolbarActions } from "./questionnaire-applicants-table-toolbar-actions"

type ListResult = Awaited<ReturnType<typeof listQuestionnaireSubmissions>>
type DetailResult = NonNullable<
  Awaited<ReturnType<typeof getQuestionnaireSubmissionDetailAction>>["data"]
>
type Submission = ListResult["data"][number]

type Props = {
  workspaceId: string
  questionnaireId: string
  promises: Promise<[ListResult]>
}

export function QuestionnaireApplicantsTable({
  workspaceId,
  questionnaireId,
  promises,
}: Props) {
  const t = useTranslations()
  const locale = useLocale()
  const [{ data, pageCount }] = use(promises)
  const [detail, setDetail] = useState<DetailResult | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const { execute: loadDetail } = useAction(
    getQuestionnaireSubmissionDetailAction.bind(null, workspaceId),
    {
      onSuccess: ({ data }) => {
        if (data) {
          setDetail(data)
        }
      },
    },
  )
  const columns = useMemo<ColumnDef<Submission>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            aria-label={t("actions.selectAll")}
            checked={table.getIsAllPageRowsSelected()}
            className="translate-y-0.5"
            indeterminate={table.getIsSomePageRowsSelected()}
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(Boolean(value))
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={t("actions.selectRow")}
            checked={row.getIsSelected()}
            className="translate-y-0.5"
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
          />
        ),
        size: 20,
        enableSorting: false,
        enableColumnFilter: false,
        enableHiding: false,
      },
      {
        id: "avatar",
        header: "",
        cell: ({ row }) => (
          <QuestionnaireApplicantAvatarCell
            contact={row.original.contact}
            onClick={() =>
              loadDetail({
                questionnaireId,
                submissionId: row.original.id,
              })
            }
            unknownContactLabel={t("questionnaires.unknownContact")}
          />
        ),
        enableSorting: false,
        enableColumnFilter: false,
      },
      {
        id: "name",
        accessorFn: (row) => row.contact.fullName,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.name.label")}
          />
        ),
        cell: ({ row }) => {
          const name =
            row.original.contact.fullName ?? t("questionnaires.unknownContact")
          return (
            <button
              className="text-start font-medium hover:underline"
              onClick={() =>
                loadDetail({
                  questionnaireId,
                  submissionId: row.original.id,
                })
              }
              type="button"
            >
              {name}
            </button>
          )
        },
        meta: {
          label: t("fields.name.label"),
          placeholder: t("fields.name.searchPlaceholder"),
          variant: "text",
        },
        enableColumnFilter: true,
      },
      {
        id: "totalPoints",
        accessorKey: "totalPoints",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("questionnaires.points")}
          />
        ),
        cell: ({ row }) => row.original.totalPoints ?? 0,
      },
      {
        id: "status",
        accessorKey: "status",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.status.label")}
          />
        ),
        cell: ({ row }) => (
          <Badge variant="secondary">
            {t(`questionnaires.status.${row.original.status}`)}
          </Badge>
        ),
      },
      {
        id: "completedAt",
        accessorKey: "completedAt",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("questionnaires.date")}
          />
        ),
        cell: ({ row }) =>
          row.original.completedAt
            ? formatDate(row.original.completedAt, { locale })
            : "",
      },
      {
        id: "actions",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t("actions.actions")} />
        ),
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  aria-label={t("actions.openMenu")}
                  className="size-8 p-0"
                  variant="ghost"
                >
                  <EllipsisVerticalIcon className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => setDeleteId(row.original.id)}
                variant="destructive"
              >
                <Trash2Icon />
                {t("actions.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
        enableSorting: false,
        enableColumnFilter: false,
      },
    ],
    [loadDetail, locale, questionnaireId, t],
  )
  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    getRowId: (row) => row.id,
    initialState: {
      columnPinning: { right: ["actions"] },
    },
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("questionnaires.applicants")}</CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            <QuestionnaireApplicantsTableToolbarActions
              questionnaireId={questionnaireId}
              table={table}
              workspaceId={workspaceId}
            />
          </DataTableToolbar>
        </DataTable>
        <ApplicantDetailModal
          detail={detail}
          onOpenChange={(open) => {
            if (!open) {
              setDetail(null)
            }
          }}
          open={Boolean(detail)}
          workspaceId={workspaceId}
        />
        <DeleteApplicantSubmissionDialog
          onOpenChange={(open) => {
            if (!open) {
              setDeleteId(null)
            }
          }}
          open={Boolean(deleteId)}
          questionnaireId={questionnaireId}
          submissionId={deleteId}
          workspaceId={workspaceId}
        />
      </CardContent>
    </Card>
  )
}
