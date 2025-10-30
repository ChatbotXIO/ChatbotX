"use client"

import { AIMcpServerAuthType } from "@aha.chat/database/types"
import { CheckboxGroupField } from "@aha.chat/ui/components/form/checkbox-field"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon, MoveRightIcon, PlusIcon, TrashIcon } from "lucide-react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { useFieldArray } from "react-hook-form"
import { toast } from "sonner"
import { createAIMcpServerAction } from "./actions/create-ai-mcp-server.action"
import { createAIMcpServerRequest } from "./schemas"

export function AIMcpServersCreate() {
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const t = useTranslations()

  const [isMcpServerValidating, setIsMcpServerValidating] =
    useState<boolean>(false)
  const [isMcpServerValidated, setIsMcpServerValidated] =
    useState<boolean>(false)
  const [allTools, setAllTools] = useState<string[]>([])
  const [isOpen, setIsOpen] = useState(false)

  const authOptions = useMemo(
    () => [
      { label: t("fields.authType.none"), value: AIMcpServerAuthType.none },
      { label: t("fields.authType.token"), value: AIMcpServerAuthType.token },
      {
        label: t("fields.authType.headers"),
        value: AIMcpServerAuthType.header,
      },
    ],
    [t],
  )

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createAIMcpServerAction.bind(null, chatbotId),
      zodResolver(createAIMcpServerRequest),
      {
        formProps: {
          mode: "onChange",
          defaultValues: {
            url: "",
            name: "",
            auth: {
              type: AIMcpServerAuthType.none,
            },
            availableTools: {},
            selectedTools: [],
          },
        },
        actionProps: {
          onSuccess: () => {
            toast.success(
              t("messages.createSuccess", {
                feature: t("fields.aiMcpServer.label"),
              }),
            )
            resetFormAndAction()
            setAllTools([])
            setIsMcpServerValidated(false)
            setIsOpen(false)
          },
          onError: ({ error }) => {
            if (error.serverError) {
              toast.error(error.serverError)
            }
          },
        },
        errorMapProps: {},
      },
    )

  const validateMcpServer = async () => {
    try {
      setIsMcpServerValidating(true)
      const response = await fetch("/api/ai-mcp-servers/validate", {
        method: "POST",
        body: JSON.stringify(form.getValues()),
      })
      const data = await response.json()

      const toolKeys = Object.keys(data)
      setIsMcpServerValidated(toolKeys.length > 0)
      setAllTools(toolKeys)
      form.setValue("availableTools", data)
      form.setValue("selectedTools", toolKeys)
    } catch (error) {
      setAllTools([])
      form.setValue("availableTools", {})
      form.setValue("selectedTools", [])
      toast.error(
        error instanceof Error ? error.message : t("messages.unknownError"),
      )
    } finally {
      setIsMcpServerValidating(false)
    }
  }

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "auth.headers",
  })

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon className="h-4 w-4" />
          {t("actions.createFeature", {
            feature: t("fields.aiMcpServer.label"),
          })}
        </Button>
      </DialogTrigger>
      <DialogContent className={"max-h-screen overflow-y-scroll lg:max-w-5xl"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.createTitle", {
              feature: t("fields.aiMcpServer.label"),
            })}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex flex-col space-y-6 py-4"
            onSubmit={handleSubmitWithAction}
          >
            <InputField label={t("fields.name.label")} name="name" required />
            <InputField label={t("fields.url.label")} name="url" required />
            <SelectField
              label={t("fields.auth.label")}
              name="auth.type"
              options={authOptions}
              required
            />
            {form.watch("auth.type") === AIMcpServerAuthType.token && (
              <InputField
                label={t("fields.authToken.label")}
                name="auth.token"
                required
              />
            )}
            {form.watch("auth.type") === AIMcpServerAuthType.header &&
              fields && (
                <div className="flex flex-col gap-2">
                  {fields.map((field, index) => (
                    <div className="flex items-start gap-2" key={field.id}>
                      <InputField
                        name={`auth.headers.${index}.header`}
                        placeholder="Header"
                      />
                      <MoveRightIcon className="size-10" />
                      <InputField
                        name={`auth.headers.${index}.value`}
                        placeholder="Value"
                      />
                      <Button
                        onClick={() => remove(index)}
                        size="icon"
                        variant="outline"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    onClick={() => append({ header: "", value: "" })}
                    variant="secondary"
                  >
                    <PlusIcon className="h-4 w-4" />
                    {t("actions.addMore")}
                  </Button>
                </div>
              )}
            {allTools.length > 0 && (
              <div className="flex flex-col gap-4">
                <div className="font-medium text-sm leading-none">
                  {t("aiMcpServers.tools.label")}
                </div>
                <CheckboxGroupField
                  // label={tool}
                  name="selectedTools"
                  options={allTools.map((tt) => ({
                    label: tt,
                    value: tt,
                  }))}
                />
              </div>
            )}
            <DialogFooter className="gap-2 sm:space-x-0">
              <DialogClose asChild>
                <Button variant="outline">{t("actions.cancel")}</Button>
              </DialogClose>

              <Button
                disabled={
                  isMcpServerValidating ||
                  !form.formState.isValid ||
                  form.formState.isSubmitting
                }
                onClick={async () => validateMcpServer()}
                type="button"
              >
                {isMcpServerValidating && (
                  <Loader2Icon className="animate-spin" />
                )}
                {t("actions.getTools")}
              </Button>

              {isMcpServerValidated && (
                <Button
                  disabled={
                    !form.formState.isValid || form.formState.isSubmitting
                  }
                >
                  {form.formState.isSubmitting && (
                    <Loader2Icon className="animate-spin" />
                  )}
                  {t("actions.confirm")}
                </Button>
              )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
