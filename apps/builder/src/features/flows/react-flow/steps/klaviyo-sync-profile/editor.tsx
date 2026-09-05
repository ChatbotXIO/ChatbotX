"use client"

import {
  type KlaviyoSyncProfileSchema,
  klaviyoSyncProfileSchema,
} from "@chatbotx.io/flow-config"
import { KLAVIYO_LIST_PAGE_SIZE } from "@chatbotx.io/integration-klaviyo"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
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
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { zodResolver } from "@hookform/resolvers/zod"
import { useQuery } from "@tanstack/react-query"
import { ArrowRightIcon, MailIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import {
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { useWorkspaceId } from "@/hooks/routing"
import { client } from "@/lib/orpc/orpc"
import { orpc } from "@/lib/orpc/query"
import { fetchAllPages } from "@/lib/query/fetch-all-pages"
import { BaseStepEditor } from "../base/editor"

const KLAVIYO_ALL_LISTS_MAX_PAGES = 20

const useAllKlaviyoLists = (workspaceId: string | undefined, open: boolean) => {
  const { data = [], isError } = useQuery({
    queryKey: [
      ...orpc.integrationKlaviyoAPI.listLists.key(),
      "all-pages",
      { workspaceId },
    ],
    queryFn: () =>
      fetchAllPages({
        initialPageParam: undefined as string | undefined,
        maxPages: KLAVIYO_ALL_LISTS_MAX_PAGES,
        fetchPage: async (cursor) => {
          const page = await client.integrationKlaviyoAPI.listLists({
            workspaceId: workspaceId ?? "",
            cursor,
            size: KLAVIYO_LIST_PAGE_SIZE,
          })
          return {
            items: page.data,
            nextPageParam: page.nextCursor ?? undefined,
          }
        },
      }),
    enabled: Boolean(workspaceId) && open,
  })
  return { data, error: isError }
}

const KlaviyoDialog = ({ parentName }: { parentName: string }) => {
  const [open, setOpen] = useState(false)
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const { getValues, setValue } = useFormContext()
  const form = useForm<KlaviyoSyncProfileSchema>({
    resolver: zodResolver(klaviyoSyncProfileSchema),
    defaultValues: { ...getValues(parentName) },
    mode: "onChange",
  })
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "mergeFields",
  })
  const mappedFields =
    useWatch({ control: form.control, name: "mergeFields" }) ?? []
  const lists = useAllKlaviyoLists(workspaceId, open)
  const listOptions = useMemo(
    () => lists.data.map(({ id, name }) => ({ label: name, value: id })),
    [lists.data],
  )

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
          <DialogTitle>{t("flows.actions.klaviyoSyncProfile")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form
            className="flex flex-col gap-6"
            onSubmit={form.handleSubmit((data) => {
              setValue(parentName, data)
              setOpen(false)
            })}
          >
            {lists.error && (
              <p className="text-destructive text-sm">
                {t("klaviyo.lists.error")}
              </p>
            )}
            <SelectField
              allowClear
              clearLabel={t("klaviyo.fields.listPlaceholder")}
              label={t("klaviyo.fields.list")}
              name="listId"
              options={listOptions}
              placeholder={t("klaviyo.fields.listPlaceholder")}
            />
            <CustomFieldSelect
              includeReserved
              label={t("klaviyo.fields.email")}
              name="emailField"
              required
            />
            <CustomFieldSelect
              includeReserved
              label={t("klaviyo.fields.titleField")}
              name="titleField"
              placeholder={t("klaviyo.fields.titlePlaceholder")}
            />
            <CustomFieldSelect
              includeReserved
              label={t("klaviyo.fields.orgField")}
              name="orgField"
              placeholder={t("klaviyo.fields.orgPlaceholder")}
            />
            <div className="flex flex-col gap-3">
              <Label>{t("klaviyo.fields.customProperties")}</Label>
              {fields.map((field, index) => (
                <div
                  className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-3"
                  key={field.id}
                >
                  <CustomFieldSelect
                    includeReserved
                    label=""
                    name={`mergeFields.${index}.contactFieldId`}
                    placeholder={t("klaviyo.fields.emptyField")}
                  />
                  <ArrowRightIcon className="size-4 text-muted-foreground rtl:rotate-180" />
                  <Input
                    placeholder={t("klaviyo.fields.propertyKey")}
                    {...form.register(`mergeFields.${index}.klaviyoProperty`)}
                  />
                  <Button
                    aria-label={t("actions.remove")}
                    onClick={() => remove(index)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <XIcon className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                disabled={mappedFields.some(
                  (mapping) =>
                    !(mapping.contactFieldId && mapping.klaviyoProperty),
                )}
                onClick={() =>
                  append({ contactFieldId: "", klaviyoProperty: "" })
                }
                type="button"
                variant="outline"
              >
                {t("klaviyo.fields.addMapping")}
              </Button>
            </div>
            <DialogFooter className="justify-between sm:justify-between">
              <Button
                onClick={() => setOpen(false)}
                type="button"
                variant="outline"
              >
                {t("actions.cancel")}
              </Button>
              <Button disabled={!form.formState.isValid} type="submit">
                {t("actions.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export default function KlaviyoSyncProfileEditor(props: {
  parentName: string
}) {
  const t = useTranslations()
  return (
    <BaseStepEditor
      icon={MailIcon}
      title={t("flows.actions.klaviyoSyncProfile")}
    >
      <KlaviyoDialog parentName={props.parentName} />
    </BaseStepEditor>
  )
}
