"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import {
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react"
import Link from "next/link"
import { useFormatter, useTranslations } from "next-intl"
import { use, useState } from "react"
import { workingHoursEditorHref } from "../lib/routes"
import type { WorkingHoursResource } from "../schema/resource"
import { CreateWorkingHoursDialog } from "./create-working-hours-dialog"
import { DeleteWorkingHoursDialog } from "./delete-working-hours-dialog"
import { RenameWorkingHoursDialog } from "./rename-working-hours-dialog"
import {
  type EmployeeOption,
  WorkingHoursEmployeesDialog,
} from "./working-hours-employees-dialog"

type ListWorkingHoursProps = {
  workspaceId: string
  promises: Promise<[WorkingHoursResource[], EmployeeOption[]]>
}

function ListWorkingHoursDetail({
  workspaceId,
  workingHours,
  employees,
}: {
  workspaceId: string
  workingHours: WorkingHoursResource[]
  employees: EmployeeOption[]
}) {
  const t = useTranslations()
  const format = useFormatter()
  const [employeesTarget, setEmployeesTarget] =
    useState<WorkingHoursResource | null>(null)
  const [renameTarget, setRenameTarget] = useState<WorkingHoursResource | null>(
    null,
  )
  const [deleteTarget, setDeleteTarget] = useState<WorkingHoursResource | null>(
    null,
  )

  return (
    <>
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("fields.name.label")}</TableHead>
              <TableHead>{t("workingHours.employees")}</TableHead>
              <TableHead>{t("fields.modified.label")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {workingHours.length ? (
              workingHours.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Button
                      className="h-auto p-0 font-medium"
                      nativeButton={false}
                      render={
                        <Link
                          href={workingHoursEditorHref(workspaceId, row.id)}
                        />
                      }
                      variant="link"
                    >
                      {row.name}
                    </Button>
                  </TableCell>
                  <TableCell>{row.memberUserIds.length}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {format.dateTime(row.updatedAt, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </TableCell>
                  <TableCell className="w-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button size="icon" variant="ghost">
                            <MoreHorizontalIcon className="h-4 w-4" />
                            <span className="sr-only">
                              {t("actions.openMenu")}
                            </span>
                          </Button>
                        }
                      />
                      <DropdownMenuContent className="flex flex-col gap-1 p-3">
                        <DropdownMenuItem
                          className="cursor-pointer text-sm"
                          onClick={() => setEmployeesTarget(row)}
                        >
                          <UsersIcon />
                          {t("workingHours.employees")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer text-sm"
                          onClick={() => setRenameTarget(row)}
                        >
                          <PencilIcon />
                          {t("actions.rename")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer text-destructive text-sm"
                          onClick={() => setDeleteTarget(row)}
                        >
                          <Trash2Icon />
                          {t("actions.delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  className="h-24 text-center text-muted-foreground"
                  colSpan={4}
                >
                  {t("workingHours.empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <WorkingHoursEmployeesDialog
        employees={employees}
        onOpenChange={() => setEmployeesTarget(null)}
        open={Boolean(employeesTarget)}
        workingHours={employeesTarget}
        workspaceId={workspaceId}
      />
      <RenameWorkingHoursDialog
        onOpenChange={() => setRenameTarget(null)}
        open={Boolean(renameTarget)}
        workingHours={renameTarget}
        workspaceId={workspaceId}
      />
      <DeleteWorkingHoursDialog
        onOpenChange={() => setDeleteTarget(null)}
        open={Boolean(deleteTarget)}
        workingHours={deleteTarget}
        workspaceId={workspaceId}
      />
    </>
  )
}

export function ListWorkingHours({
  workspaceId,
  promises,
}: ListWorkingHoursProps) {
  const t = useTranslations()
  const [workingHours, employees] = use(promises)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("workingHours.title")}
        </CardTitle>
        <CardDescription>{t("workingHours.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex justify-end">
          <CreateWorkingHoursDialog workspaceId={workspaceId} />
        </div>
        <ListWorkingHoursDetail
          employees={employees}
          workingHours={workingHours}
          workspaceId={workspaceId}
        />
      </CardContent>
    </Card>
  )
}

export function ListWorkingHoursFallback() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-40" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-32 w-full" />
      </CardContent>
    </Card>
  )
}
