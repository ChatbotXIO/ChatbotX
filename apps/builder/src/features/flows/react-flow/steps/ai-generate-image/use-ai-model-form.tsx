"use client"

import { aiGenerateImageDefaultFn } from "@aha.chat/flow-config"
import { zodResolver } from "@hookform/resolvers/zod"
import { useCallback, useEffect } from "react"
import { useForm, useFormContext } from "react-hook-form"
import { z } from "zod"

const defaultStep = aiGenerateImageDefaultFn()

export const aiModelFormInputSchema = z.object({
  provider: z.string().min(1, "Provider is required"),
  model: z.string().min(1, "Model is required"),
  prompt: z.string().min(1, "User Message is required"),
  quality: z.string().min(1, "Quality is required"),
  size: z.string().min(1, "Image Size is required"),
  outputCfId: z.string().min(1, "Save result to a custom field is required"),
})

export const aiModelFormOutputSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  prompt: z.string().min(1),
  quality: z.string().min(1),
  size: z.string().min(1),
  outputCfId: z.string().min(1),
})

export type AIModelFormInputData = z.infer<typeof aiModelFormInputSchema>
export type AIModelFormOutputData = z.infer<typeof aiModelFormOutputSchema>

type UseAIModelFormProps = {
  parentName: string
}

const FORM_FIELDS: (keyof AIModelFormOutputData)[] = [
  "provider",
  "model",
  "prompt",
  "quality",
  "size",
  "outputCfId",
]

const normalizeToFormInput = (
  parentValues: Record<string, unknown>,
): AIModelFormInputData => ({
  provider: (parentValues.provider as string) || defaultStep.provider,
  model: (parentValues.model as string) || defaultStep.model,
  prompt: (parentValues.prompt as string) || defaultStep.prompt || "",
  quality: (parentValues.quality as string) || defaultStep.quality,
  size: (parentValues.size as string) || defaultStep.size,
  outputCfId: (parentValues.outputCfId as string) || defaultStep.outputCfId,
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

  useEffect(() => {
    const newCurrentValues = normalizeToFormInput(parentValues)
    form.reset(newCurrentValues)
  }, [parentValues, form])

  const onSubmit = useCallback(() => {
    const values = form.getValues()
    const convertedValues: AIModelFormOutputData = {
      ...values,
    }

    for (const field of FORM_FIELDS) {
      setValueParent(`${parentName}.${field}`, convertedValues[field], {
        shouldValidate: true,
        shouldDirty: true,
      })
    }
  }, [form, setValueParent, parentName])

  return {
    form,
    onSubmit,
  }
}
