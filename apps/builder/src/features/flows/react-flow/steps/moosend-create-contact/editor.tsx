"use client"

import {
  type MoosendCreateContactSchema,
  moosendCreateContactSchema,
} from "@chatbotx.io/flow-config"
import {
  MOOSEND_EDITOR_PAGE_SIZE,
  type MoosendMailingListPage,
} from "@chatbotx.io/integration-moosend"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import ky from "ky"
import { MailIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { useForm, useFormContext } from "react-hook-form"
import useSWRInfinite from "swr/infinite"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { useWorkspaceId } from "@/hooks/routing"
import { BaseStepEditor } from "../base/editor"

const MoosendDialog = ({ parentName }: { parentName: string }) => {
  const [open, setOpen] = useState(false)
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const { getValues, setValue } = useFormContext()
  const form = useForm<MoosendCreateContactSchema>({
    resolver: zodResolver(moosendCreateContactSchema),
    defaultValues: { ...getValues(parentName) },
    mode: "onChange",
  })
  const {
    data: pages,
    error: listsError,
    isLoading: listsLoading,
    setSize,
  } = useSWRInfinite<MoosendMailingListPage>(
    (pageIndex, previousPage) => {
      if (!workspaceId) {
        return null
      }
      if (previousPage && pageIndex >= previousPage.meta.totalPageCount) {
        return null
      }
      return `/api/workspaces/${workspaceId}/moosend/mailing-lists?page=${
        pageIndex + 1
      }&pageSize=${MOOSEND_EDITOR_PAGE_SIZE}`
    },
    (url: string) => ky.get(url).json(),
  )
  const totalPageCount = pages?.[0]?.meta.totalPageCount ?? 0

  useEffect(() => {
    if (pages && pages.length < totalPageCount) {
      setSize(totalPageCount)
    }
  }, [pages, setSize, totalPageCount])

  const mailingLists = pages?.flatMap((page) => page.data) ?? []
  const listOptions = useMemo(
    () =>
      mailingLists.map((list) => ({
        label: list.name,
        value: list.id,
      })),
    [mailingLists],
  )
  const listsEmpty = !(listsLoading || listsError) && mailingLists.length === 0
  const submit = (data: MoosendCreateContactSchema) => {
    setValue(parentName, data)
    setOpen(false)
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          {t("actions.edit")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("flows.actions.moosendCreateContact")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit(submit)}
          >
            <ComboboxField
              label={t("moosend.fields.list")}
              name="listId"
              options={listOptions}
              placeholder={t("moosend.fields.listPlaceholder")}
              portal
              required
            />
            {listsLoading && <p>{t("moosend.lists.loading")}</p>}
            {listsError && (
              <p className="text-destructive">{t("moosend.lists.error")}</p>
            )}
            {listsEmpty && (
              <p className="text-muted-foreground">
                {t("moosend.lists.empty")}
              </p>
            )}
            <CustomFieldSelect
              includeReserved
              label={t("moosend.fields.email")}
              name="emailField"
              portal
              required
            />
            <DialogFooter>
              <Button
                onClick={() => setOpen(false)}
                type="button"
                variant="secondary"
              >
                {t("actions.cancel")}
              </Button>
              <Button
                disabled={
                  !form.formState.isValid ||
                  listsLoading ||
                  Boolean(listsError) ||
                  listsEmpty
                }
                type="submit"
              >
                {t("actions.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export default function MoosendCreateContactEditor(props: {
  parentName: string
}) {
  const t = useTranslations()
  return (
    <BaseStepEditor
      icon={MailIcon}
      title={t("flows.actions.moosendCreateContact")}
    >
      <MoosendDialog parentName={props.parentName} />
    </BaseStepEditor>
  )
}
