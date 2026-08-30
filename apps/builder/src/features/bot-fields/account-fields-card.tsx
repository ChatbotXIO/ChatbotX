"use client"

import type { CustomFieldType } from "@chatbotx.io/database/partials"
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
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { use, useEffect, useMemo, useState } from "react"
import { getBrowserTimezone } from "../contact-filter/lib/timezone"
import CustomFieldTypeLabel from "../custom-fields/components/custom-field-label"
import { formatCustomFieldDisplayValue } from "../custom-fields/lib/format-custom-field-display-value"
import { CreateBotFieldDialog } from "./create-bot-field-dialog"
import { DeleteBotFieldsDialog } from "./delete-bot-fields-dialog"
import type { listBotFieldsRSC } from "./queries"
import { ResetBotFieldsDialog } from "./reset-bot-fields-dialog"
import type { BotFieldResource } from "./schema/resource"
import { UpdateBotFieldDialog } from "./update-bot-field-dialog"

const ACCOUNT_FIELDS_PAGE_SIZE = 10

function applySetMembership(set: Set<string>, id: string, checked: boolean) {
  if (checked) {
    set.add(id)
  } else {
    set.delete(id)
  }
}

type AccountFieldsCardProps = {
  workspaceId: string
  folderId: string | null
  promises: Promise<[Awaited<ReturnType<typeof listBotFieldsRSC>>]>
}

type AccountFieldRowAction = {
  record: BotFieldResource
  variant: "update" | "delete"
}

function TruncatedCell({ value }: { value: string | null | undefined }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div className="inline-block max-w-[200px] truncate">{value}</div>
        }
      />
      <TooltipContent>
        <p>{value}</p>
      </TooltipContent>
    </Tooltip>
  )
}

function AccountFieldRowActions({
  onSelect,
}: {
  onSelect: (variant: AccountFieldRowAction["variant"]) => void
}) {
  const t = useTranslations()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button size="icon" variant="ghost">
            <MoreHorizontalIcon className="h-4 w-4" />
            <span className="sr-only">{t("actions.openMenu")}</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onSelect("update")}>
          <PencilIcon />
          {t("actions.edit")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onSelect("delete")}
          variant="destructive"
        >
          <Trash2Icon />
          {t("actions.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AccountFieldsCard({
  workspaceId,
  folderId,
  promises,
}: AccountFieldsCardProps) {
  const t = useTranslations()
  const router = useRouter()
  const [{ data }] = use(promises)

  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [rowAction, setRowAction] = useState<AccountFieldRowAction | null>(null)
  const [timezone, setTimezone] = useState("UTC")

  useEffect(() => {
    setTimezone(getBrowserTimezone())
  }, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) {
      return data
    }
    return data.filter((field) => field.name.toLowerCase().includes(term))
  }, [data, search])

  const pageCount = Math.max(
    1,
    Math.ceil(filtered.length / ACCOUNT_FIELDS_PAGE_SIZE),
  )
  const currentPage = Math.min(page, pageCount)
  const pageData = useMemo(
    () =>
      filtered.slice(
        (currentPage - 1) * ACCOUNT_FIELDS_PAGE_SIZE,
        currentPage * ACCOUNT_FIELDS_PAGE_SIZE,
      ),
    [filtered, currentPage],
  )

  const selectedRecords = useMemo(
    () => data.filter((field) => selectedIds.has(field.id)),
    [data, selectedIds],
  )

  const allPageRowsSelected =
    pageData.length > 0 && pageData.every((field) => selectedIds.has(field.id))
  const somePageRowsSelected =
    pageData.some((field) => selectedIds.has(field.id)) && !allPageRowsSelected

  const toggleAllPageRows = (checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      for (const field of pageData) {
        applySetMembership(next, field.id, checked)
      }
      return next
    })
  }

  const toggleRow = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      applySetMembership(next, id, checked)
      return next
    })
  }

  const handleSearchChange = (value: string) => {
    setPage(1)
    setSearch(value)
  }

  const handleRefresh = () => {
    router.refresh()
  }

  return (
    <Card>
      <CardHeader className="flex items-center">
        <CardTitle className="flex-1 font-bold text-xl">
          {t("accountFields.title")}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <SearchIcon className="absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="w-56 pl-8"
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder={t("actions.search")}
              value={search}
            />
          </div>

          <div className="ms-auto flex items-center gap-2">
            {selectedRecords.length > 0 ? (
              <>
                <ResetBotFieldsDialog
                  onSuccess={() => {
                    setSelectedIds(new Set())
                    handleRefresh()
                  }}
                  records={selectedRecords}
                  workspaceId={workspaceId}
                />
                <DeleteBotFieldsDialog
                  onSuccess={() => {
                    setSelectedIds(new Set())
                    handleRefresh()
                  }}
                  records={selectedRecords}
                  workspaceId={workspaceId}
                />
              </>
            ) : null}

            <CreateBotFieldDialog
              folderId={folderId}
              onSuccess={handleRefresh}
              workspaceId={workspaceId}
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label={t("actions.selectAll")}
                    checked={allPageRowsSelected}
                    indeterminate={somePageRowsSelected}
                    onCheckedChange={(value) =>
                      toggleAllPageRows(Boolean(value))
                    }
                  />
                </TableHead>
                <TableHead>{t("fields.name.label")}</TableHead>
                <TableHead>{t("fields.type.label")}</TableHead>
                <TableHead>{t("fields.value.label")}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageData.map((field) => (
                <TableRow
                  data-state={selectedIds.has(field.id) ? "selected" : ""}
                  key={field.id}
                >
                  <TableCell>
                    <Checkbox
                      aria-label={t("actions.selectRow")}
                      checked={selectedIds.has(field.id)}
                      onCheckedChange={(value) =>
                        toggleRow(field.id, Boolean(value))
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <TruncatedCell value={field.name} />
                  </TableCell>
                  <TableCell>
                    <CustomFieldTypeLabel
                      type={field.type as CustomFieldType}
                    />
                  </TableCell>
                  <TableCell>
                    <TruncatedCell
                      value={formatCustomFieldDisplayValue(
                        field.type as CustomFieldType,
                        field.value,
                        timezone,
                        {
                          false: t("fields.boolean.false"),
                          true: t("fields.boolean.true"),
                        },
                      )}
                    />
                  </TableCell>
                  <TableCell>
                    <AccountFieldRowActions
                      onSelect={(variant) =>
                        setRowAction({ record: field, variant })
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
              {pageData.length === 0 ? (
                <TableRow>
                  <TableCell
                    className="text-center text-muted-foreground"
                    colSpan={5}
                  >
                    {t("actions.noRecordFound")}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        {pageCount > 1 ? (
          <div className="flex items-center justify-end gap-2 text-sm">
            <span className="text-muted-foreground">
              {t("analytics.pagination.pageOf", {
                page: currentPage,
                pageCount,
              })}
            </span>
            <Button
              aria-label={t("analytics.pagination.previousPage")}
              disabled={currentPage <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              size="icon"
              variant="outline"
            >
              <ChevronLeftIcon className="size-4 rtl:rotate-180" />
            </Button>
            <Button
              aria-label={t("analytics.pagination.nextPage")}
              disabled={currentPage >= pageCount}
              onClick={() =>
                setPage((current) => Math.min(pageCount, current + 1))
              }
              size="icon"
              variant="outline"
            >
              <ChevronRightIcon className="size-4 rtl:rotate-180" />
            </Button>
          </div>
        ) : null}

        <DeleteBotFieldsDialog
          onOpenChange={() => setRowAction(null)}
          onSuccess={() => {
            setSelectedIds((current) => {
              const next = new Set(current)
              if (rowAction?.record.id) {
                next.delete(rowAction.record.id)
              }
              return next
            })
            handleRefresh()
          }}
          open={rowAction?.variant === "delete"}
          records={rowAction?.record ? [rowAction.record] : []}
          showTrigger={false}
          workspaceId={workspaceId}
        />

        <UpdateBotFieldDialog
          botField={rowAction?.record ?? null}
          onOpenChange={() => setRowAction(null)}
          onSuccess={handleRefresh}
          open={rowAction?.variant === "update"}
          workspaceId={workspaceId}
        />
      </CardContent>
    </Card>
  )
}
