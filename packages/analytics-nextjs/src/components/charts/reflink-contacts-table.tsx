"use client"

import type { FlowNodeContactData } from "@chatbotx.io/analytics"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@chatbotx.io/ui/components/ui/pagination"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { useLocale, useTranslations } from "next-intl"
import { useAnalysisStore } from "../../provider/analysis-store-context"
import { formatDateWithYear } from "../../utils/date-format"

function getFullName(contact: FlowNodeContactData): string {
  if (contact.firstName || contact.lastName) {
    return [contact.firstName, contact.lastName].filter(Boolean).join(" ")
  }
  return contact.sourceId ?? "-"
}

function getInitial(contact: FlowNodeContactData): string {
  return contact.firstName?.[0]?.toUpperCase() ?? "?"
}

export function ReflinkContactsTable() {
  const t = useTranslations()
  const locale = useLocale()
  const {
    reflinkContacts: contacts,
    reflinkContactsPage: page,
    reflinkContactsPageCount: pageCount,
    setReflinkContactsPage,
    loading,
  } = useAnalysisStore((state) => state)

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>{t("fields.name.label")}</TableHead>
              <TableHead>{t("analytics.date")}</TableHead>
              <TableHead>{t("fields.source.label")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.length > 0 ? (
              contacts.map((contact) => (
                <TableRow key={contact.contactInboxId}>
                  <TableCell>
                    <Avatar className="size-8">
                      <AvatarImage src={contact.avatar ?? undefined} />
                      <AvatarFallback>{getInitial(contact)}</AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell className="font-medium">
                    {getFullName(contact)}
                  </TableCell>
                  <TableCell>
                    {formatDateWithYear(new Date(contact.occurredAt), locale)}
                  </TableCell>
                  <TableCell>{contact.sourceId ?? "-"}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell className="h-24 text-center" colSpan={4}>
                  {t("fields.noResults.label")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {pageCount > 1 && (
        <Pagination className="justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                aria-disabled={page <= 1 || loading}
                className={
                  page <= 1 || loading
                    ? "pointer-events-none opacity-50"
                    : "cursor-pointer"
                }
                onClick={() => setReflinkContactsPage(page - 1)}
              />
            </PaginationItem>
            <PaginationItem>
              <span className="flex items-center px-2 text-sm">
                {page} / {pageCount}
              </span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                aria-disabled={page >= pageCount || loading}
                className={
                  page >= pageCount || loading
                    ? "pointer-events-none opacity-50"
                    : "cursor-pointer"
                }
                onClick={() => setReflinkContactsPage(page + 1)}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  )
}
