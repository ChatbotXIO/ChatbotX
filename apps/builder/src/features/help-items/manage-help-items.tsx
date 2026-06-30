"use client"

import type { TenantHelpItemModel } from "@chatbotx.io/database/types"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { DynamicIcon, type IconName } from "lucide-react/dynamic"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import type { z } from "zod"
import { createHelpItemAction } from "./actions/create-help-item.action"
import { deleteHelpItemAction } from "./actions/delete-help-item.action"
import { updateHelpItemAction } from "./actions/update-help-item.action"
import { helpItemSchema } from "./schema"
import type { HelpItemScope } from "./scope"

// Use the schema's input type so zodResolver and useForm agree on optional/required fields.
type HelpItemFormValues = z.input<typeof helpItemSchema>

type HelpItemFormDialogProps = {
  trigger: React.ReactNode
  title: string
  defaultValues: HelpItemFormValues
  onSubmit: (values: HelpItemFormValues) => void
  isPending: boolean
}

const HelpItemFormDialog = ({
  trigger,
  title,
  defaultValues,
  onSubmit,
  isPending,
}: HelpItemFormDialogProps) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  const form = useForm<HelpItemFormValues>({
    resolver: zodResolver(helpItemSchema),
    defaultValues,
  })

  const handleOpenChange = (val: boolean) => {
    setOpen(val)
    if (!val) {
      form.reset(defaultValues)
    }
  }

  const handleFormSubmit = form.handleSubmit((values) => {
    onSubmit(values)
    setOpen(false)
    form.reset(defaultValues)
  })

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={handleFormSubmit}>
            <InputField<HelpItemFormValues>
              label={t("helpItems.fields.name")}
              name="name"
              placeholder={t("helpItems.fields.namePlaceholder")}
              required
            />
            <InputField<HelpItemFormValues>
              label={t("helpItems.fields.url")}
              name="url"
              placeholder={t("helpItems.fields.urlPlaceholder")}
              required
              type="url"
            />
            <div className="space-y-1">
              <InputField<HelpItemFormValues>
                label={t("helpItems.fields.icon")}
                name="icon"
                placeholder={t("helpItems.fields.iconPlaceholder")}
              />
              <a
                className="text-muted-foreground text-xs underline-offset-2 hover:text-foreground hover:underline"
                href="https://lucide.dev/icons/"
                rel="noopener noreferrer"
                target="_blank"
              >
                {t("helpItems.fields.iconSearchLink")}
              </a>
            </div>
            <InputNumberField<HelpItemFormValues>
              label={t("helpItems.fields.position")}
              min={0}
              name="position"
            />
            <DialogFooter className="gap-2 sm:space-x-0">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  {t("actions.cancel")}
                </Button>
              </DialogClose>
              <Button disabled={isPending} type="submit">
                {isPending && <Loader2 className="animate-spin" />}
                {t("actions.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

type ManageHelpItemsProps = {
  items: TenantHelpItemModel[]
  scope?: HelpItemScope
}

export const ManageHelpItems = ({
  items,
  scope = "tenant",
}: ManageHelpItemsProps) => {
  const t = useTranslations()
  const router = useRouter()
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null)

  // Bind the scope arg as required by bindArgsSchemas (invariant #4).
  const boundCreate = useMemo(
    () => createHelpItemAction.bind(null, scope),
    [scope],
  )
  const boundUpdate = useMemo(
    () => updateHelpItemAction.bind(null, scope),
    [scope],
  )
  const boundDelete = useMemo(
    () => deleteHelpItemAction.bind(null, scope),
    [scope],
  )

  const { execute: executeCreate, isPending: isCreating } = useAction(
    boundCreate,
    {
      onSuccess: () => {
        toast.success(
          t("messages.createdSuccess", { feature: t("helpItems.title") }),
        )
        router.refresh()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const { execute: executeUpdate, isPending: isUpdating } = useAction(
    boundUpdate,
    {
      onSuccess: () => {
        toast.success(
          t("messages.updatedSuccess", { feature: t("helpItems.title") }),
        )
        router.refresh()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const { execute: executeDelete, isPending: isDeleting } = useAction(
    boundDelete,
    {
      onSuccess: () => {
        setDeletingItemId(null)
        toast.success(
          t("messages.deletedSuccess", { feature: t("helpItems.title") }),
        )
        router.refresh()
      },
      onError: ({ error }) => {
        setDeletingItemId(null)
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <HelpItemFormDialog
          defaultValues={{
            name: "",
            url: "",
            icon: "",
            position: items.length,
          }}
          isPending={isCreating}
          onSubmit={(values) => executeCreate(values)}
          title={t("helpItems.addTitle")}
          trigger={
            <Button size="sm">
              <PlusIcon />
              {t("helpItems.addButton")}
            </Button>
          }
        />
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("helpItems.empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                {t("helpItems.fields.icon")}
              </TableHead>
              <TableHead>{t("helpItems.fields.name")}</TableHead>
              <TableHead>{t("helpItems.fields.url")}</TableHead>
              <TableHead>{t("helpItems.fields.position")}</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const isDeletingItem = isDeleting && deletingItemId === item.id

              return (
                <TableRow key={item.id}>
                  <TableCell>
                    <DynamicIcon
                      className="size-4"
                      name={(item.icon ?? "circle-help") as IconName}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground text-sm">
                    {item.url}
                  </TableCell>
                  <TableCell>{item.position}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <HelpItemFormDialog
                        defaultValues={{
                          name: item.name,
                          url: item.url,
                          icon: item.icon ?? "",
                          position: item.position,
                        }}
                        isPending={isUpdating}
                        onSubmit={(values) =>
                          executeUpdate({ id: item.id, ...values })
                        }
                        title={t("helpItems.editTitle")}
                        trigger={
                          <Button
                            aria-label={t("actions.edit")}
                            size="icon"
                            variant="ghost"
                          >
                            <PencilIcon className="size-4" />
                          </Button>
                        }
                      />
                      <Button
                        aria-label={t("actions.delete")}
                        disabled={isDeletingItem}
                        onClick={() => {
                          if (isDeleting) {
                            return
                          }
                          setDeletingItemId(item.id)
                          executeDelete({ id: item.id })
                        }}
                        size="icon"
                        variant="ghost"
                      >
                        {isDeletingItem ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2Icon className="size-4" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
