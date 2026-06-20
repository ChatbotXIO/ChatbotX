"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { Loader2Icon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { deleteUserPersistentMenuAction } from "../actions/delete-user-persistent-menu.action"
import type { ListUserPersistentMenusResponse } from "../schema/action"

type UserPersistentMenu = ListUserPersistentMenusResponse["data"][number]

export function UserPersistentMenuList({
  workspaceId,
  menus,
}: {
  workspaceId: string
  menus: ListUserPersistentMenusResponse["data"]
}) {
  const t = useTranslations()
  const router = useRouter()
  const [deleteTarget, setDeleteTarget] = useState<UserPersistentMenu | null>(
    null,
  )

  const { execute, isPending } = useAction(
    deleteUserPersistentMenuAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(
          t("messages.deletedSuccess", {
            feature: t("fields.userPersistentMenu.label"),
          }),
        )
        setDeleteTarget(null)
        router.refresh()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-bold text-xl">
          {t("userPersistentMenus.title")}
        </CardTitle>
        <Button asChild size="sm">
          <Link
            href={`/space/${workspaceId}/settings/user-persistent-menus/create`}
          >
            <PlusIcon />
            {t("actions.createFeature", {
              feature: t("fields.userPersistentMenu.label"),
            })}
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("fields.name.label")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {menus.length ? (
                menus.map((menu) => (
                  <TableRow key={menu.id}>
                    <TableCell>{menu.name}</TableCell>
                    <TableCell className="w-1 text-right">
                      <Button asChild size="icon" variant="ghost">
                        <Link
                          href={`/space/${workspaceId}/settings/user-persistent-menus/${menu.id}`}
                        >
                          <PencilIcon className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        className="text-destructive"
                        onClick={() => setDeleteTarget(menu)}
                        size="icon"
                        variant="ghost"
                      >
                        <Trash2Icon className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell className="h-24 text-center" colSpan={2}>
                    {t("messages.noResults")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        open={Boolean(deleteTarget)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("messages.deleteFeature", {
                feature: t("fields.userPersistentMenu.label"),
              })}
            </DialogTitle>
            <DialogDescription className="whitespace-pre-wrap text-sm/6">
              {t("messages.deleteConfirmation", {
                feature: t("fields.userPersistentMenu.label"),
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button
              onClick={() => setDeleteTarget(null)}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("actions.cancel")}
            </Button>
            <Button
              disabled={isPending}
              onClick={() => execute({ ids: [deleteTarget?.id ?? ""] })}
              size="sm"
              type="submit"
            >
              {isPending && <Loader2Icon className="animate-spin" />}
              {t("actions.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
