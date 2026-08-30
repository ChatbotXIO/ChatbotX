"use client"

import {
  type MailerLiteAddSubscriberSchema,
  mailerLiteAddSubscriberSchema,
} from "@chatbotx.io/flow-config"
import {
  MAILER_LITE_EDITOR_PAGE_SIZE,
  type MailerLiteField,
  type MailerLiteGroup,
} from "@chatbotx.io/integration-mailer-lite"
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
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowRightIcon, Loader2Icon, MailIcon, XIcon } from "lucide-react"
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
import { client } from "@/lib/orpc/orpc"
import { BaseStepEditor } from "../base/editor"

type MailerLiteEditorPage<T> = {
  data: T[]
  meta: { lastPage: number }
}

const useAllMailerLitePages = <T,>(
  fetchPage: (
    workspaceId: string,
    page: number,
  ) => Promise<MailerLiteEditorPage<T>>,
  cacheKey: string,
  workspaceId: string,
) => {
  const {
    data: pages,
    isLoading,
    setSize,
  } = useSWRInfinite<MailerLiteEditorPage<T>>(
    (pageIndex, previousPage) => {
      if (!workspaceId) {
        return null
      }
      if (previousPage && pageIndex >= previousPage.meta.lastPage) {
        return null
      }
      return [cacheKey, workspaceId, pageIndex + 1] as const
    },
    ([, wsId, page]: readonly [string, string, number]) =>
      fetchPage(wsId, page),
  )
  const lastPage = pages?.[0]?.meta.lastPage ?? 1

  useEffect(() => {
    if (pages && pages.length < lastPage) {
      setSize(lastPage)
    }
  }, [lastPage, pages, setSize])

  return {
    data: pages?.flatMap((page) => page.data) ?? [],
    isLoading,
  }
}

const fetchMailerLiteGroups = (workspaceId: string, page: number) =>
  client.integrationMailerLiteAPI.listGroups({
    workspaceId,
    page,
    limit: MAILER_LITE_EDITOR_PAGE_SIZE,
  })

const fetchMailerLiteFields = (workspaceId: string, page: number) =>
  client.integrationMailerLiteAPI.listFields({
    workspaceId,
    page,
    limit: MAILER_LITE_EDITOR_PAGE_SIZE,
  })

const MailerLiteDialog = ({ parentName }: { parentName: string }) => {
  const [open, setOpen] = useState(false)
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const { getValues, setValue } = useFormContext()
  const form = useForm<MailerLiteAddSubscriberSchema>({
    resolver: zodResolver(mailerLiteAddSubscriberSchema),
    defaultValues: { ...getValues(parentName) },
    mode: "onChange",
  })
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "mergeFields",
  })
  const mappedFields =
    useWatch({ control: form.control, name: "mergeFields" }) ?? []
  const groups = useAllMailerLitePages<MailerLiteGroup>(
    fetchMailerLiteGroups,
    "mailer-lite-groups",
    workspaceId,
  )
  const providerFields = useAllMailerLitePages<MailerLiteField>(
    fetchMailerLiteFields,
    "mailer-lite-fields",
    workspaceId,
  )
  const groupOptions = useMemo(
    () =>
      groups.data.map((group) => ({
        label: group.name,
        value: group.id,
      })),
    [groups.data],
  )
  const providerFieldOptions = useMemo(
    () =>
      providerFields.data.map((field) => ({
        label: field.name,
        value: field.key,
      })),
    [providerFields.data],
  )
  const mappedProviderFields = new Set(
    mappedFields.map((mapping) => mapping.mailerLiteField).filter(Boolean),
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
          <DialogTitle>
            {t("flows.actions.mailerLiteAddSubscriber")}
          </DialogTitle>
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
            <SelectField
              allowClear
              clearLabel={t("mailerLite.fields.groupPlaceholder")}
              label={t("mailerLite.fields.group")}
              name="groupId"
              options={groupOptions}
              placeholder={t("mailerLite.fields.groupPlaceholder")}
            />
            <CustomFieldSelect
              includeReserved
              label={t("mailerLite.fields.email")}
              name="emailField"
              required
            />
            <SelectField
              label={t("mailerLite.fields.status")}
              name="status"
              options={[
                { label: t("mailerLite.status.active"), value: "active" },
                {
                  label: t("mailerLite.status.unconfirmed"),
                  value: "unconfirmed",
                },
              ]}
              required
            />
            <div className="flex flex-col gap-3">
              <Label className="font-medium">
                {t("mailerLite.fields.customFields")}
              </Label>
              {providerFields.isLoading ? (
                <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
              ) : (
                fields.map((field, index) => (
                  <div
                    className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-3"
                    key={field.id}
                  >
                    <CustomFieldSelect
                      includeReserved
                      label=""
                      name={`mergeFields.${index}.contactFieldId`}
                      placeholder={t("mailerLite.fields.emptyField")}
                    />
                    <ArrowRightIcon className="size-4 text-muted-foreground rtl:rotate-180" />
                    <SelectField
                      disableValues={mappedFields.flatMap(
                        (mapping, mappingIndex) =>
                          mappingIndex !== index && mapping.mailerLiteField
                            ? [mapping.mailerLiteField]
                            : [],
                      )}
                      name={`mergeFields.${index}.mailerLiteField`}
                      options={providerFieldOptions}
                      placeholder={t("mailerLite.fields.providerField")}
                      required
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
                ))
              )}
              <Button
                disabled={
                  mappedFields.some((mapping) => !mapping.mailerLiteField) ||
                  mappedProviderFields.size >= providerFields.data.length
                }
                onClick={() =>
                  append({ contactFieldId: "", mailerLiteField: "" })
                }
                type="button"
                variant="outline"
              >
                {t("mailerLite.fields.addMapping")}
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

export default function MailerLiteAddSubscriberEditor(props: {
  parentName: string
}) {
  const t = useTranslations()
  return (
    <BaseStepEditor
      icon={MailIcon}
      title={t("flows.actions.mailerLiteAddSubscriber")}
    >
      <MailerLiteDialog parentName={props.parentName} />
    </BaseStepEditor>
  )
}
