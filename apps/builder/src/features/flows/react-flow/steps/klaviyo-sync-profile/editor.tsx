"use client"

import {
  type KlaviyoSyncProfileSchema,
  klaviyoSyncProfileSchema,
} from "@chatbotx.io/flow-config"
import {
  KLAVIYO_LIST_PAGE_SIZE,
  type KlaviyoList,
} from "@chatbotx.io/integration-klaviyo"
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
import ky from "ky"
import { ArrowRightIcon, MailIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import {
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form"
import useSWRInfinite from "swr/infinite"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { useWorkspaceId } from "@/hooks/routing"
import { BaseStepEditor } from "../base/editor"

type KlaviyoEditorPage<T> = {
  data: T[]
  nextCursor: string | null
}

export const getKlaviyoPageKey =
  (baseUrl: string | null) =>
  <T,>(
    _pageIndex: number,
    previousPage: KlaviyoEditorPage<T> | null,
  ): string | null => {
    if (!(baseUrl && (!previousPage || previousPage.nextCursor))) {
      return null
    }
    return previousPage?.nextCursor
      ? `${baseUrl}&cursor=${encodeURIComponent(previousPage.nextCursor)}`
      : baseUrl
  }

const useAllKlaviyoPages = <T,>(baseUrl: string | null) => {
  const {
    data: pages,
    error,
    isValidating,
    setSize,
    size,
  } = useSWRInfinite<KlaviyoEditorPage<T>>(
    getKlaviyoPageKey(baseUrl),
    (url: string) => ky.get(url).json(),
  )
  const nextCursor = pages?.at(-1)?.nextCursor
  useEffect(() => {
    if (nextCursor && !isValidating && size === pages?.length) {
      setSize(size + 1)
    }
  }, [isValidating, nextCursor, pages?.length, setSize, size])
  return {
    data: pages?.flatMap((page) => page.data) ?? [],
    error,
  }
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
  const baseUrl =
    workspaceId && open ? `/api/workspaces/${workspaceId}/klaviyo` : null
  const lists = useAllKlaviyoPages<KlaviyoList>(
    baseUrl ? `${baseUrl}/lists?size=${KLAVIYO_LIST_PAGE_SIZE}` : null,
  )
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
