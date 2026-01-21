"use client"

import {
  type GetResponseStepSchema,
  getResponseDefaultFn,
  getResponseStepSchema,
} from "@aha.chat/flow-config"
import { ComboboxField } from "@aha.chat/ui/components/form/combobox-field"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { MultiSelectField } from "@aha.chat/ui/components/form/multi-select-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@aha.chat/ui/components/ui/tooltip"
import { zodResolver } from "@hookform/resolvers/zod"
import { InfoIcon, Loader2Icon, MailIcon } from "lucide-react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { useForm, useFormContext } from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { useGetResponseStore } from "@/features/integration-get-response/provider/get-response-store-context"
import { BaseStepEditor } from "../base/editor"

type GetResponseStepFormProps = {
  parentName: string
  onSuccess?: () => void
  onCancel?: () => void
}

const GetResponseStepForm = memo(
  ({ parentName, onSuccess, onCancel }: GetResponseStepFormProps) => {
    const t = useTranslations()
    const { chatbotId } = useParams<{ chatbotId: string }>()
    const { getValues: getParentValues, setValue: setParentValue } =
      useFormContext()

    const getInitialValues = useCallback(
      (
        savedData: Partial<GetResponseStepSchema> | undefined,
      ): GetResponseStepSchema => {
        const defaultValues = getResponseDefaultFn()
        if (!savedData) {
          return defaultValues
        }

        return {
          ...defaultValues,
          ...savedData,
          dayOfCycle:
            savedData.dayOfCycle === null || savedData.dayOfCycle === undefined
              ? undefined
              : String(savedData.dayOfCycle),
        }
      },
      [],
    )

    const form = useForm<GetResponseStepSchema>({
      resolver: zodResolver(getResponseStepSchema),
      defaultValues: getInitialValues(getParentValues(parentName)),
      mode: "onChange",
    })

    useEffect(() => {
      const parentData = getParentValues(parentName)
      if (parentData) {
        form.reset(getInitialValues(parentData))
      }
    }, [form, getParentValues, parentName, getInitialValues])

    const campaigns = useGetResponseStore((s) => s.campaigns)
    const tags = useGetResponseStore((s) => s.tags)

    const fetchCampaigns = useGetResponseStore((s) => s.fetchCampaigns)
    const fetchTags = useGetResponseStore((s) => s.fetchTags)

    useEffect(() => {
      if (chatbotId) {
        fetchCampaigns(chatbotId)
        fetchTags(chatbotId)
      }
    }, [chatbotId, fetchCampaigns, fetchTags])

    const campaignOptions = useMemo(
      () => (campaigns ?? []).map((v) => ({ label: v.name, value: v.id })),
      [campaigns],
    )

    const tagOptions = useMemo(
      () => (tags ?? []).map((v) => ({ label: v.name, value: v.tagId })),
      [tags],
    )

    const handleCancel = () => {
      form.reset()
      onCancel?.()
    }

    const onSubmit = (data: GetResponseStepSchema) => {
      setParentValue(parentName, data)
      onSuccess?.()
    }

    return (
      <Form {...form}>
        <form
          className="flex flex-col gap-6"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <ComboboxField
            contentClassName="w-[var(--radix-popover-trigger-width)]"
            label={t("getResponse.fields.list")}
            name="campaignId"
            options={campaignOptions}
            placeholder={t("getResponse.fields.listPlaceholder")}
            required
          />

          <CustomFieldSelect
            includeReserved={true}
            label={t("getResponse.fields.emailField")}
            name="emailField"
            required
            tooltip={t("getResponse.fields.emailFieldTooltip")}
          />

          <MultiSelectField
            label={t("getResponse.fields.tags")}
            name="tags"
            options={tagOptions}
            placeholder={t("getResponse.fields.tagsPlaceholder")}
          />

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">
                {t("getResponse.fields.dayOfCycle")}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <InfoIcon className="size-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("getResponse.fields.dayOfCycleTooltip")}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <InputField name="dayOfCycle" type="number" />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              onClick={handleCancel}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("actions.cancel")}
            </Button>
            <Button disabled={!form.formState.isValid} size="sm" type="submit">
              {form.formState.isSubmitting && (
                <Loader2Icon className="animate-spin" />
              )}
              {t("actions.confirm")}
            </Button>
          </div>
        </form>
      </Form>
    )
  },
)

GetResponseStepForm.displayName = "GetResponseStepForm"

type GetResponseStepEditorProps = {
  parentName: string
}

export const GetResponseStepEditor = ({
  parentName,
}: GetResponseStepEditorProps) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  const handleOpenChange = useCallback((v: boolean) => {
    setOpen(v)
  }, [])

  const handleSuccess = useCallback(() => {
    setOpen(false)
  }, [])

  const handleCancel = useCallback(() => {
    setOpen(false)
  }, [])

  return (
    <BaseStepEditor icon={MailIcon} title={t("flows.actions.getResponse")}>
      <div className="flex flex-col gap-3">
        <Dialog onOpenChange={handleOpenChange} open={open}>
          <DialogTrigger asChild>
            <div className="flex justify-center">
              <Button size="sm" variant="outline">
                {t("actions.edit")}
              </Button>
            </div>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("flows.actions.getResponse")}</DialogTitle>
              <DialogDescription />
            </DialogHeader>
            <GetResponseStepForm
              onCancel={handleCancel}
              onSuccess={handleSuccess}
              parentName={parentName}
            />
          </DialogContent>
        </Dialog>
      </div>
    </BaseStepEditor>
  )
}

export default GetResponseStepEditor
