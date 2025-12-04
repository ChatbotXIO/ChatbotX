"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useCallback, useEffect } from "react"
import { useForm, useFormContext } from "react-hook-form"
import { z } from "zod"

// Schema for AI model form (input)
export const aiModelFormInputSchema = z.object({
  model: z.string().optional(),
  prompt: z.string().optional(),
  userMessage: z.string().optional(),
  outputCfId: z.string().optional(),
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
  outputCfId: z.string().optional(),
  tools: z.array(z.string()).optional(),
  rememberConversation: z.array(z.string()).optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
})

export type AIModelFormInputData = z.infer<typeof aiModelFormInputSchema>
export type AIModelFormOutputData = z.infer<typeof aiModelFormOutputSchema>

// Default values constants
const DEFAULT_TEMPERATURE = 0.4
const DEFAULT_MAX_TOKENS = 250

type UseAIModelFormProps = {
  parentName: string
}

// Helper function to normalize parent values to form input format
const normalizeToFormInput = (
  parentValues: Record<string, unknown>,
): AIModelFormInputData => ({
  ...parentValues,
  rememberConversation: parentValues.rememberConversation ? ["1"] : [],
  model: (parentValues.model as string) || "",
  prompt: (parentValues.prompt as string) || "",
  userMessage: (parentValues.userMessage as string) || "",
  outputCfId: (parentValues.outputCfId as string) || "",
  tools: (parentValues.tools as string[]) || [],
  temperature: (parentValues.temperature as number) || DEFAULT_TEMPERATURE,
  maxTokens: (parentValues.maxTokens as number) || DEFAULT_MAX_TOKENS,
})

export const useAIModelForm = ({ parentName }: UseAIModelFormProps) => {
  const { getValues, setValue: setValueParent } = useFormContext()

  const parentValues = getValues(parentName) || {}
  const currentValues = normalizeToFormInput(parentValues)

  const form = useForm<AIModelFormInputData>({
    resolver: zodResolver(aiModelFormInputSchema),
    defaultValues: currentValues,
    mode: "all",
    shouldUseNativeValidation: false,
  })

  // Reset form when currentValues change
  useEffect(() => {
    const newCurrentValues = normalizeToFormInput(parentValues)
    form.reset(newCurrentValues)
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
    const formFields: (keyof AIModelFormOutputData)[] = [
      "model",
      "prompt",
      "userMessage",
      "outputCfId",
      "tools",
      "temperature",
      "maxTokens",
    ]

    for (const field of formFields) {
      setValueParent(`${parentName}.${field}`, convertedValues[field], {
        shouldValidate: true,
        shouldDirty: true,
      })
    }

    // Handle rememberConversation separately (convert array to boolean)
    setValueParent(
      `${parentName}.rememberConversation`,
      (convertedValues.rememberConversation || []).includes("1"),
      { shouldValidate: true, shouldDirty: true },
    )
  }, [form, setValueParent, parentName])

  return {
    form,
    onSubmit,
  }
}
