"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { type Node, useEdges, useNodes } from "@xyflow/react"
import { useOptimisticAction } from "next-safe-action/hooks"
import { useCallback, useEffect } from "react"
import { useForm, useFormContext } from "react-hook-form"
import { z } from "zod"
import { updateDraftFlowVersionAction } from "@/features/flows/actions/update-draft-flow-version-action"
import type { FlowVersionResource } from "@/features/flows/schemas/get-flows-schema"

// Schema for AI model form (input)
export const aiModelFormInputSchema = z.object({
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
export const aiModelFormOutputSchema = z.object({
  model: z.string().optional(),
  prompt: z.string().optional(),
  userMessage: z.string().optional(),
  resultCustomFieldId: z.string().optional(),
  tools: z.array(z.string()).optional(),
  rememberConversation: z.array(z.string()).optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
})

export type AIModelFormInputData = z.infer<typeof aiModelFormInputSchema>
export type AIModelFormOutputData = z.infer<typeof aiModelFormOutputSchema>

type UseAIModelFormProps = {
  parentName: string
  flowVersion: FlowVersionResource
}

export const useAIModelForm = ({
  parentName,
  flowVersion,
}: UseAIModelFormProps) => {
  const { getValues, setValue: setValueParent } = useFormContext()
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

  const parentValues = getValues(parentName) || {}
  const currentValues: AIModelFormInputData = {
    ...parentValues,
    rememberConversation: parentValues.rememberConversation ? ["1"] : [],
  }

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
    mode: "all",
    shouldUseNativeValidation: false,
  })

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

  const onSubmit = useCallback(() => {
    const values = form.getValues()
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
    setValueParent(`${parentName}.model`, convertedValues.model, {
      shouldValidate: true,
      shouldDirty: true,
    })
    setValueParent(`${parentName}.prompt`, convertedValues.prompt, {
      shouldValidate: true,
      shouldDirty: true,
    })
    setValueParent(`${parentName}.userMessage`, convertedValues.userMessage, {
      shouldValidate: true,
      shouldDirty: true,
    })
    setValueParent(
      `${parentName}.resultCustomFieldId`,
      convertedValues.resultCustomFieldId,
      {
        shouldValidate: true,
        shouldDirty: true,
      },
    )
    setValueParent(`${parentName}.tools`, convertedValues.tools, {
      shouldValidate: true,
      shouldDirty: true,
    })
    setValueParent(
      `${parentName}.rememberConversation`,
      (convertedValues.rememberConversation || []).includes("1"),
      { shouldValidate: true, shouldDirty: true },
    )
    setValueParent(`${parentName}.temperature`, convertedValues.temperature, {
      shouldValidate: true,
      shouldDirty: true,
    })
    setValueParent(`${parentName}.maxTokens`, convertedValues.maxTokens, {
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
  }, [form, setValueParent, parentName, nodes, edges, savingDraft])

  return {
    form,
    onSubmit,
  }
}
