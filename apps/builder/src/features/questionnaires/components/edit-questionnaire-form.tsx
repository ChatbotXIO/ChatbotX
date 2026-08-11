"use client"

import type {
  SupportedQuestionnaireQuestionType,
  SystemFieldType,
} from "@chatbotx.io/database/partials"
import { supportedQuestionnaireQuestionTypes } from "@chatbotx.io/database/partials"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { type FormEvent, useMemo } from "react"
import { useFieldArray, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { DirectUploadOrInsertLink } from "@/components/direct-upload"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"
import { updateQuestionnaireAction } from "../actions/update-questionnaire.action"
import {
  noQuestionnaireTriggerFlowValue,
  type UpdateQuestionnaireRequest,
  updateQuestionnaireRequest,
} from "../schemas/action"
import {
  getCustomFieldSelectionReset,
  getQuestionFieldMappingReset,
} from "../utils/field-mapping"
import { duplicateQuestionnaireQuestionDraft } from "../utils/question"
import { getQuestionnaireDefaultRetryMessage } from "../utils/retry-message"

type QuestionnaireForEdit = Awaited<
  ReturnType<
    typeof import("../queries/get-questionnaire.query").getQuestionnaire
  >
>

const getRetryMessageType = (
  type: string,
): SupportedQuestionnaireQuestionType =>
  supportedQuestionnaireQuestionTypes.safeParse(type).success
    ? (type as SupportedQuestionnaireQuestionType)
    : "text"

const createDraftQuestion = (
  retryMessage: string,
): UpdateQuestionnaireRequest["questions"][number] => ({
  title: "",
  type: "text",
  active: true,
  image: { mode: "file", url: "" },
  point: 1,
  retryMessage,
  customFieldId: null,
  config: { options: [] },
})

const writableSystemFieldIdsByQuestionType: Record<string, SystemFieldType[]> =
  {
    text: ["first_name", "last_name", "full_name"],
    multipleChoice: ["first_name", "last_name", "full_name"],
    number: [],
    email: ["email"],
    phone: ["phone"],
  }

export function EditQuestionnaireForm({
  workspaceId,
  questionnaire,
}: {
  workspaceId: string
  questionnaire: QuestionnaireForEdit
}) {
  const t = useTranslations()
  const router = useRouter()
  const flowOptions = useFlowSelectOptions()
  const triggerFlowOptions = useMemo(
    () => [
      {
        label: t("messages.none"),
        value: noQuestionnaireTriggerFlowValue,
      },
      ...flowOptions,
    ],
    [flowOptions, t],
  )
  const responseTypeOptions = useMemo(
    () => [
      { label: t("questionnaires.responseTypes.text"), value: "text" },
      { label: t("questionnaires.responseTypes.number"), value: "number" },
      { label: t("questionnaires.responseTypes.email"), value: "email" },
      { label: t("questionnaires.responseTypes.phone"), value: "phone" },
      {
        label: t("questionnaires.responseTypes.multipleChoice"),
        value: "multipleChoice",
      },
    ],
    [t],
  )

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateQuestionnaireAction.bind(null, workspaceId, questionnaire.id),
    zodResolver(updateQuestionnaireRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("questionnaires.singular"),
            }),
          )
          router.push(`/space/${workspaceId}/questionnaires`)
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
          triggerFlowId:
            questionnaire.triggerFlowId ?? noQuestionnaireTriggerFlowValue,
          enableScore: questionnaire.enableScore,
          enableRetryMessages: questionnaire.enableRetryMessages,
          enableCustomFieldMapping: questionnaire.enableCustomFieldMapping,
          questions:
            questionnaire.questions.length > 0
              ? questionnaire.questions.map((question) => ({
                  id: question.id,
                  title: question.title,
                  type: question.type as UpdateQuestionnaireRequest["questions"][number]["type"],
                  active: question.active,
                  image: question.image ?? { mode: "file", url: "" },
                  point: question.point,
                  retryMessage:
                    question.retryMessage ||
                    getQuestionnaireDefaultRetryMessage(
                      getRetryMessageType(question.type),
                      t,
                    ),
                  customFieldId:
                    question.systemFieldKey ?? question.customFieldId,
                  systemFieldKey: question.systemFieldKey,
                  config: question.config ?? { options: [] },
                }))
              : [
                  createDraftQuestion(
                    getQuestionnaireDefaultRetryMessage("text", t),
                  ),
                ],
        },
      },
    },
  )

  const { fields, append, remove, move, insert } = useFieldArray({
    control: form.control,
    name: "questions",
  })
  const enableScore = useWatch({ control: form.control, name: "enableScore" })
  const enableRetryMessages = useWatch({
    control: form.control,
    name: "enableRetryMessages",
  })
  const enableCustomFieldMapping = useWatch({
    control: form.control,
    name: "enableCustomFieldMapping",
  })
  const questions = useWatch({ control: form.control, name: "questions" })
  const triggerQuestionsValidation = () => {
    queueMicrotask(() => {
      form.trigger("questions").catch(() => undefined)
    })
  }
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const isValid = await form.trigger(undefined, { shouldFocus: true })
    if (!isValid) {
      return
    }
    await handleSubmitWithAction(event)
  }

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-semibold text-xl">{questionnaire.name}</h1>
          <div className="flex gap-2">
            <Button
              onClick={() =>
                router.push(`/space/${workspaceId}/questionnaires`)
              }
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
                <Loader2Icon className="size-4 animate-spin" />
              )}
              {t("actions.save")}
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("questionnaires.generalSettings")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ComboboxField
              emptyText={t("actions.noRecordFound")}
              label={t("questionnaires.triggerFlow")}
              name="triggerFlowId"
              options={triggerFlowOptions}
              placeholder={t("actions.pleaseSelect")}
            />
            <SwitchField
              label={t("questionnaires.enableScore")}
              name="enableScore"
              required
            />
            <SwitchField
              label={t("questionnaires.enableRetryMessages")}
              name="enableRetryMessages"
              required
            />
            <SwitchField
              label={t("questionnaires.enableCustomFieldMapping")}
              name="enableCustomFieldMapping"
              required
            />
          </CardContent>
        </Card>

        <div className="space-y-3">
          {fields.map((field, index) => {
            const type = questions?.[index]?.type ?? "text"
            return (
              <Card key={field.id}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {t("questionnaires.question")} {index + 1}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-start gap-4">
                  <div className="grid min-w-0 flex-1 gap-4">
                    <InputField
                      label={t("questionnaires.question")}
                      name={`questions.${index}.title`}
                      required
                    />
                    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                      <div className="space-y-1">
                        <div className="font-medium text-sm">
                          {t("questionnaires.questionImage")}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {t("questionnaires.questionImageHint")}
                        </div>
                      </div>
                      <DirectUploadOrInsertLink
                        fileType="image"
                        parentName={`questions.${index}.image`}
                        uploadPath={`public/space/${workspaceId}/questionnaires/${questionnaire.id}/questions/${field.id}`}
                      />
                    </div>
                    <SwitchField
                      label={t("questionnaires.activeQuestion")}
                      name={`questions.${index}.active`}
                      required
                    />
                    <SelectField
                      label={t("questionnaires.responseType")}
                      name={`questions.${index}.type`}
                      options={responseTypeOptions}
                      required
                      triggerValueChange={(value) => {
                        if (!value) {
                          return
                        }
                        const nextType =
                          value as UpdateQuestionnaireRequest["questions"][number]["type"]
                        const reset = getQuestionFieldMappingReset()
                        form.setValue(
                          `questions.${index}.customFieldId`,
                          reset.customFieldId,
                        )
                        form.setValue(
                          `questions.${index}.systemFieldKey`,
                          reset.systemFieldKey,
                        )
                        form.setValue(
                          `questions.${index}.retryMessage`,
                          getQuestionnaireDefaultRetryMessage(
                            getRetryMessageType(nextType),
                            t,
                          ),
                        )
                      }}
                    />
                    {type === "multipleChoice" ? (
                      <div className="space-y-2">
                        <div className="font-medium text-sm">
                          {t("questionnaires.options")}
                        </div>
                        {(questions?.[index]?.config?.options ?? []).map(
                          (option, optionIndex) => (
                            <div
                              className="flex flex-wrap items-start gap-2"
                              key={option.id}
                            >
                              <InputField
                                formItemClassName="w-full max-w-[300px]"
                                label=""
                                name={`questions.${index}.config.options.${optionIndex}.label`}
                              />
                              {enableScore ? (
                                <InputNumberField
                                  formItemClassName="w-[120px]"
                                  label=""
                                  min={0}
                                  name={`questions.${index}.config.options.${optionIndex}.points`}
                                />
                              ) : null}
                              <Button
                                aria-label={t("actions.moveUp")}
                                disabled={optionIndex === 0}
                                onClick={() => {
                                  const options = [
                                    ...(form.getValues(
                                      `questions.${index}.config.options`,
                                    ) ?? []),
                                  ]
                                  const previousOption =
                                    options[optionIndex - 1]
                                  const currentOption = options[optionIndex]
                                  if (!(previousOption && currentOption)) {
                                    return
                                  }
                                  options[optionIndex - 1] = currentOption
                                  options[optionIndex] = previousOption
                                  form.setValue(
                                    `questions.${index}.config.options`,
                                    options,
                                  )
                                }}
                                size="icon"
                                type="button"
                                variant="ghost"
                              >
                                <ArrowUpIcon className="size-4" />
                              </Button>
                              <Button
                                aria-label={t("actions.moveDown")}
                                disabled={
                                  optionIndex ===
                                  (questions?.[index]?.config?.options
                                    ?.length ?? 0) -
                                    1
                                }
                                onClick={() => {
                                  const options = [
                                    ...(form.getValues(
                                      `questions.${index}.config.options`,
                                    ) ?? []),
                                  ]
                                  const currentOption = options[optionIndex]
                                  const nextOption = options[optionIndex + 1]
                                  if (!(currentOption && nextOption)) {
                                    return
                                  }
                                  options[optionIndex] = nextOption
                                  options[optionIndex + 1] = currentOption
                                  form.setValue(
                                    `questions.${index}.config.options`,
                                    options,
                                  )
                                }}
                                size="icon"
                                type="button"
                                variant="ghost"
                              >
                                <ArrowDownIcon className="size-4" />
                              </Button>
                              <Button
                                aria-label={t("actions.delete")}
                                onClick={() => {
                                  const options =
                                    form.getValues(
                                      `questions.${index}.config.options`,
                                    ) ?? []
                                  form.setValue(
                                    `questions.${index}.config.options`,
                                    options.filter(
                                      (_, idx) => idx !== optionIndex,
                                    ),
                                  )
                                }}
                                type="button"
                                variant="ghost"
                              >
                                <Trash2Icon className="size-4" />
                              </Button>
                            </div>
                          ),
                        )}
                        <Button
                          onClick={() => {
                            const options =
                              form.getValues(
                                `questions.${index}.config.options`,
                              ) ?? []
                            form.setValue(`questions.${index}.config.options`, [
                              ...options,
                              {
                                id: crypto.randomUUID(),
                                label: "",
                                points: 0,
                              },
                            ])
                          }}
                          type="button"
                          variant="outline"
                        >
                          <PlusIcon className="size-4" />
                          {t("actions.add")}
                        </Button>
                      </div>
                    ) : null}
                    {enableScore && type !== "multipleChoice" ? (
                      <InputNumberField
                        formItemClassName="max-w-[300px]"
                        label={t("questionnaires.points")}
                        min={0}
                        name={`questions.${index}.point`}
                        required
                      />
                    ) : null}
                    {enableRetryMessages ? (
                      <InputField
                        label={t("questionnaires.retryMessage")}
                        name={`questions.${index}.retryMessage`}
                        required
                      />
                    ) : null}
                    {enableCustomFieldMapping ? (
                      <CustomFieldSelect
                        allowCreate
                        includeReserved
                        label={t("questionnaires.customField")}
                        name={`questions.${index}.customFieldId`}
                        onValueChange={() => {
                          const reset = getCustomFieldSelectionReset()
                          form.setValue(
                            `questions.${index}.systemFieldKey`,
                            reset.systemFieldKey,
                          )
                        }}
                        required
                        reservedFieldIds={
                          writableSystemFieldIdsByQuestionType[type]
                        }
                      />
                    ) : null}
                  </div>
                  <div className="flex w-10 shrink-0 flex-col items-center gap-1 pt-1">
                    <Button
                      aria-label={t("actions.delete")}
                      onClick={() => {
                        remove(index)
                        triggerQuestionsValidation()
                      }}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                    <Button
                      aria-label={t("actions.duplicate")}
                      disabled={fields.length >= 100}
                      onClick={() => {
                        const question = questions[
                          index
                        ] as UpdateQuestionnaireRequest["questions"][number]
                        insert(
                          index + 1,
                          duplicateQuestionnaireQuestionDraft(question),
                        )
                        triggerQuestionsValidation()
                      }}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <CopyIcon className="size-4" />
                    </Button>
                    <Button
                      aria-label={t("actions.moveUp")}
                      disabled={index === 0}
                      onClick={() => move(index, index - 1)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <ArrowUpIcon className="size-4" />
                    </Button>
                    <Button
                      aria-label={t("actions.moveDown")}
                      disabled={index === fields.length - 1}
                      onClick={() => move(index, index + 1)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <ArrowDownIcon className="size-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
        <div className="flex justify-center">
          <Button
            className="min-w-32"
            disabled={fields.length >= 100}
            onClick={() => {
              append(
                createDraftQuestion(
                  getQuestionnaireDefaultRetryMessage("text", t),
                ),
              )
              triggerQuestionsValidation()
            }}
            type="button"
          >
            <PlusIcon className="size-4" />
            {t("questionnaires.addNew")}
          </Button>
        </div>
      </form>
    </Form>
  )
}
