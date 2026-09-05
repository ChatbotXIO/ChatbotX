"use client"

import {
  type MoosendCreateContactSchema,
  moosendCreateContactSchema,
} from "@chatbotx.io/flow-config"
import { MOOSEND_EDITOR_PAGE_SIZE } from "@chatbotx.io/integration-moosend"
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
import { useQuery } from "@tanstack/react-query"
import { MailIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { useForm, useFormContext } from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { useWorkspaceId } from "@/hooks/routing"
import { client } from "@/lib/orpc/orpc"
import { orpc } from "@/lib/orpc/query"
import { fetchAllPages } from "@/lib/query/fetch-all-pages"
import { BaseStepEditor } from "../base/editor"

const MOOSEND_ALL_LISTS_MAX_PAGES = 20

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
    data: mailingLists = [],
    isError: listsError,
    isLoading: listsLoading,
  } = useQuery({
    queryKey: [
      ...orpc.integrationMoosendAPI.listMailingLists.key(),
      "all-pages",
      { workspaceId },
    ],
    queryFn: () =>
      fetchAllPages({
        initialPageParam: 1,
        maxPages: MOOSEND_ALL_LISTS_MAX_PAGES,
        fetchPage: async (page) => {
          const data = await client.integrationMoosendAPI.listMailingLists({
            workspaceId,
            page,
            pageSize: MOOSEND_EDITOR_PAGE_SIZE,
          })
          return {
            items: data.data,
            nextPageParam:
              page < data.meta.totalPageCount ? page + 1 : undefined,
          }
        },
      }),
    enabled: open && Boolean(workspaceId),
  })
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
      <DialogTrigger
        render={
          <Button size="sm" type="button" variant="outline">
            {t("actions.edit")}
          </Button>
        }
      />
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
              emptyText={t("actions.noRecordFound")}
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
