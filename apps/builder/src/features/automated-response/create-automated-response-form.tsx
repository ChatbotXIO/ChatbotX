"use client"

import type { AutomatedResponseType } from "@chatbotx.io/database/partials"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form, FormMessage } from "@chatbotx.io/ui/components/ui/form"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@chatbotx.io/ui/components/ui/toggle-group"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon, PlusCircleIcon, XIcon } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { useFieldArray } from "react-hook-form"
import { toast } from "sonner"
import { useFlowSelectOptions } from "../flows/provider/flow-hook"
import { createAutomatedResponseAction } from "./actions/create-automated-response-action"
import { useKeywordFieldNavigation } from "./hooks/use-keyword-field-navigation"
import { createAutomatedResponseRequest, responseModes } from "./schema/action"

type CreateAutomatedResponseFormProps = {
  workspaceId: string
  folderId: string | null
  type: AutomatedResponseType
  basePath: string
}

export function CreateAutomatedResponseForm(
  props: CreateAutomatedResponseFormProps,
) {
  const { workspaceId, folderId, type, basePath } = props

  const searchParams = useSearchParams()

  const t = useTranslations()
  const router = useRouter()

  const flowOptions = useFlowSelectOptions()
  const [responseMode, setResponseMode] = useState("flowId")

  const {
    form,
    handleSubmitWithAction,
    form: { control },
  } = useHookFormAction(
    createAutomatedResponseAction.bind(null, workspaceId, type),
    zodResolver(createAutomatedResponseRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.createdSuccess", {
              feature: t("fields.automatedResponse.label"),
            }),
          )
          router.push(
            `/space/${workspaceId}/${basePath}?${searchParams.toString()}`,
          )
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          folderId: folderId ?? null,
          keywords: [{ value: "" }],
          text: "",
          flowId: "",
        },
      },
      errorMapProps: {},
    },
  )

  const { setValue } = form
  useEffect(() => {
    if (folderId) {
      setValue("folderId", folderId)
    }
  }, [setValue, folderId])

  const {
    fields: keywords,
    append: appendKeywords,
    remove: removeKeywords,
  } = useFieldArray({
    control,
    name: "keywords",
  })

  const handleKeywordInputKeyDown = useKeywordFieldNavigation(
    form,
    keywords.length,
    () => appendKeywords({ value: "" }),
  )

  return (
    <Form {...form}>
      <form
        className="w-1/2 flex-1 space-y-4"
        onSubmit={handleSubmitWithAction}
      >
        <div className="flex flex-col gap-2">
          <Label className="flex-1 font-bold" htmlFor="keywords">
            {t("fields.keywords.label")}
          </Label>

          <div className="flex flex-col gap-2">
            {keywords.map((_, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: wip
              <div className="flex gap-2" key={index}>
                <InputField
                  name={`keywords.${index}.value`}
                  onKeyDown={(event) => {
                    handleKeywordInputKeyDown(event, index)
                  }}
                />
                {index === 0 ? (
                  <div className="w-12">&nbsp;</div>
                ) : (
                  <Button
                    onClick={() => {
                      removeKeywords(index)
                    }}
                    variant="ghost"
                  >
                    <XIcon />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <FormMessage />
          <div>
            <Button
              onClick={() => {
                appendKeywords({ value: "" })
              }}
              variant="ghost"
            >
              <PlusCircleIcon /> {t("actions.addMore")}
            </Button>
          </div>
        </div>

        {/* Bot response block */}
        <div className="mt-4 flex items-center gap-4">
          <Label className="font-bold" htmlFor="replyMode">
            {t("fields.botResponse.label")}
          </Label>

          <ToggleGroup
            defaultValue={[responseMode]}
            onValueChange={(vals) => {
              const val = vals[0]
              if (val) {
                setResponseMode(val)
                if (val === responseModes.enum.flowId) {
                  setValue("text", "")
                }
                if (val === responseModes.enum.text) {
                  setValue("flowId", "")
                }
              }
            }}
            value={[responseMode]}
            variant="outline"
          >
            <ToggleGroupItem
              aria-label="Send flow"
              value={responseModes.enum.flowId}
            >
              {t("fields.flow.label")}
            </ToggleGroupItem>
            <ToggleGroupItem
              aria-label="Send text"
              value={responseModes.enum.text}
            >
              {t("fields.text.label")}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {responseMode === responseModes.enum.flowId && (
          <ComboboxField
            emptyText={t("actions.noRecordFound")}
            label={t("fields.flowId.label")}
            name="flowId"
            options={flowOptions}
            placeholder={t("actions.pleaseSelect")}
            required
          />
        )}

        {responseMode === responseModes.enum.text && (
          <InputField label={t("fields.text.label")} name="text" required />
        )}

        <div className="flex justify-end gap-4">
          <Button
            onClick={() => router.push(`/space/${workspaceId}/${basePath}`)}
            type="button"
            variant="ghost"
          >
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={!form.formState.isValid || form.formState.isSubmitting}
            type="submit"
          >
            {form.formState.isSubmitting && (
              <Loader2Icon className="animate-spin" />
            )}
            {t("actions.confirm")}
          </Button>
        </div>
      </form>
    </Form>
  )
}
