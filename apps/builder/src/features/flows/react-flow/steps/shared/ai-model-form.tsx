"use client"

import { CheckboxGroupField } from "@aha.chat/ui/components/form/checkbox-field"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { TextareaField } from "@aha.chat/ui/components/form/textarea-field"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { type Node, useEdges, useNodes } from "@xyflow/react"
import { useTranslations } from "next-intl"
import { useOptimisticAction } from "next-safe-action/hooks"
import { useEffect } from "react"
import { useForm, useFormContext } from "react-hook-form"
import { z } from "zod"
import { AIToolMultiSelect } from "@/features/ai-triggers/ai-tool-multi-select"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { updateDraftFlowVersionAction } from "@/features/flows/actions/update-draft-flow-version-action"
import type { FlowVersionResource } from "@/features/flows/schemas/get-flows-schema"

// Schema for AI model form (input)
const aiModelFormInputSchema = z.object({
  model: z.string().optional(),
  prompt: z.string().optional(),
  userMessage: z.string().optional(),
  resultCustomFieldId: z.string().optional(),
  tools: z.array(z.string()).optional(),
  rememberConversation: z.array(z.string()).optional(),
  temperature: z.union([z.number(), z.string()]).optional(),
  maxTokens: z.union([z.number(), z.string()]).optional(),
})

// Schema for AI model form (output)
const aiModelFormOutputSchema = z.object({
  model: z.string().optional(),
  prompt: z.string().optional(),
  userMessage: z.string().optional(),
  resultCustomFieldId: z.string().optional(),
  tools: z.array(z.string()).optional(),
  rememberConversation: z.array(z.string()).optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
})

type AIModelFormInputData = z.infer<typeof aiModelFormInputSchema>
type AIModelFormOutputData = z.infer<typeof aiModelFormOutputSchema>

type AIModelFormProps = {
  parentName: string
  modelSelectComponent: React.ComponentType<{ name: string }>
  dialogComponent: React.ComponentType<{
    name: string
    children?: React.ReactNode
    onSubmit?: () => void
  }>
  flowVersion: FlowVersionResource
}

export const AIModelForm = ({
  parentName,
  modelSelectComponent: ModelSelectComponent,
  dialogComponent: DialogComponent,
  flowVersion,
}: AIModelFormProps) => {
  const t = useTranslations()
  const { setValue, getValues } = useFormContext()
  const nodes = useNodes()
  const edges = useEdges()

  // Setup updateDraftFlowVersionAction
  const { execute: savingDraft } = useOptimisticAction(
    updateDraftFlowVersionAction.bind(
      null,
      flowVersion?.chatbotId || "",
      flowVersion?.id || "",
    ),
    {
      currentState: { flowVersion },
      updateFn: (state, updatedData) => ({
        flowVersion: {
          ...state.flowVersion,
          ...updatedData,
        },
      }),
    },
  )

  // Get current values from parent form
  const parentValues = getValues(parentName) || {}
  const currentValues: AIModelFormInputData = {
    ...parentValues,
    rememberConversation: parentValues.rememberConversation ? ["1"] : [],
  }

  // Create form for dialog
  const form = useForm<AIModelFormInputData>({
    resolver: zodResolver(aiModelFormInputSchema),
    defaultValues: {
      model: currentValues.model || "",
      prompt: currentValues.prompt || "",
      userMessage: currentValues.userMessage || "",
      resultCustomFieldId: currentValues.resultCustomFieldId || "",
      tools: currentValues.tools || [],
      rememberConversation: currentValues.rememberConversation || [],
      temperature: currentValues.temperature || 0.4,
      maxTokens: currentValues.maxTokens || 250,
    },
  })

  // Watch form values changes
  form.watch()

  // Reset form when currentValues change
  useEffect(() => {
    const newCurrentValues = {
      ...parentValues,
      rememberConversation: parentValues.rememberConversation ? ["1"] : [],
    }

    form.reset({
      model: newCurrentValues.model || "",
      prompt: newCurrentValues.prompt || "",
      userMessage: newCurrentValues.userMessage || "",
      resultCustomFieldId: newCurrentValues.resultCustomFieldId || "",
      tools: newCurrentValues.tools || [],
      rememberConversation: newCurrentValues.rememberConversation || [],
      temperature: newCurrentValues.temperature || 0.4,
      maxTokens: newCurrentValues.maxTokens || 250,
    })
  }, [parentValues, form])

  // Early return if flowVersion is not available
  if (!flowVersion) {
    return null
  }

  const onSubmit = (values: AIModelFormInputData) => {
    // Convert input data to output data
    const convertedValues: AIModelFormOutputData = {
      ...values,
      temperature:
        typeof values.temperature === "string"
          ? Number.parseFloat(values.temperature)
          : values.temperature,
      maxTokens:
        typeof values.maxTokens === "string"
          ? Number.parseInt(values.maxTokens, 10)
          : values.maxTokens,
    }

    // Update parent form with new values

    setValue(`${parentName}.model`, convertedValues.model, {
      shouldValidate: true,
      shouldDirty: true,
    })
    setValue(`${parentName}.prompt`, convertedValues.prompt, {
      shouldValidate: true,
      shouldDirty: true,
    })
    setValue(`${parentName}.userMessage`, convertedValues.userMessage, {
      shouldValidate: true,
      shouldDirty: true,
    })
    setValue(
      `${parentName}.resultCustomFieldId`,
      convertedValues.resultCustomFieldId,
      {
        shouldValidate: true,
        shouldDirty: true,
      },
    )
    setValue(`${parentName}.tools`, convertedValues.tools, {
      shouldValidate: true,
      shouldDirty: true,
    })
    setValue(
      `${parentName}.rememberConversation`,
      (convertedValues.rememberConversation || []).includes("1"),
      { shouldValidate: true, shouldDirty: true },
    )
    setValue(`${parentName}.temperature`, convertedValues.temperature, {
      shouldValidate: true,
      shouldDirty: true,
    })
    setValue(`${parentName}.maxTokens`, convertedValues.maxTokens, {
      shouldValidate: true,
      shouldDirty: true,
    })

    // Update the specific step in nodes
    const updatedNodes: Node[] = nodes.map((node) => {
      if (node.data.steps) {
        const stepIndex = Number.parseInt(parentName.split(".")[1], 10)
        const updatedSteps = [...(node.data.steps as unknown[])]
        if (updatedSteps[stepIndex]) {
          updatedSteps[stepIndex] = {
            ...updatedSteps[stepIndex],
            ...convertedValues,
            rememberConversation: (
              convertedValues.rememberConversation || []
            ).includes("1"),
          }
        }
        return {
          ...node,
          data: {
            ...node.data,
            steps: updatedSteps,
          },
        }
      }
      return node
    })

    // Save to database immediately
    savingDraft({
      // biome-ignore lint/suspicious/noExplicitAny: Type conversion needed for API compatibility
      nodes: updatedNodes as any,
      // biome-ignore lint/suspicious/noExplicitAny: Type conversion needed for API compatibility
      edges: edges as any,
    })
  }

  return (
    <DialogComponent
      name={t("actions.generateText")}
      onSubmit={() => {
        form.handleSubmit(onSubmit)()
      }}
    >
      <Form {...form}>
        <div className="space-y-4">
          <ModelSelectComponent name="model" />

          <TextareaField label={t("fields.prompt.label")} name="prompt" />

          <InputField
            label={t("fields.userMessage.label")}
            name="userMessage"
          />

          <CustomFieldSelect
            allowCreate={true}
            label={t("fields.ouputCFId.label")}
            name="resultCustomFieldId"
          />

          <AIToolMultiSelect name="tools" />

          <CheckboxGroupField
            name="rememberConversation"
            options={[
              { value: "1", label: t("fields.rememberConversation.label") },
            ]}
          />

          <InputField
            label={t("fields.temperature.label")}
            name="temperature"
            placeholder={t("fields.placeholders.temperatureHint")}
            type="number"
          />

          <InputField
            label={t("fields.maxTokens.label")}
            name="maxTokens"
            placeholder={t("fields.placeholders.maxTokensHint")}
            type="number"
          />
        </div>
      </Form>
    </DialogComponent>
  )
}
