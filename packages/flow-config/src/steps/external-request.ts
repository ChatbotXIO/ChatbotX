import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  errorStateDefaultFn,
  errorStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

export const externalRequestMethods = z.enum([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
])
export type ExternalRequestMethod = z.infer<typeof externalRequestMethods>

export const methodsWithBody = ["POST", "PUT", "PATCH"] as const

export const externalRequestBodyTypes = z.enum([
  "allContactData",
  "json",
  "formEncoded",
])
export type ExternalRequestBodyType = z.infer<typeof externalRequestBodyTypes>

export const externalRequestHeaderSchema = z.object({
  key: z.string().trim().min(1),
  value: z.string(),
})
export type ExternalRequestHeaderSchema = z.infer<
  typeof externalRequestHeaderSchema
>

const hasDuplicateKeys = (items: { key: string }[]) => {
  const seen = new Set<string>()
  for (const item of items) {
    const normalized = item.key.trim().toLowerCase()
    if (!normalized) {
      continue
    }
    if (seen.has(normalized)) {
      return true
    }
    seen.add(normalized)
  }
  return false
}

const externalRequestBodySchema = z.discriminatedUnion("bodyType", [
  z.object({
    bodyType: z.literal(externalRequestBodyTypes.enum.allContactData),
  }),
  z.object({
    bodyType: z.literal(externalRequestBodyTypes.enum.json),
    jsonBody: z.string().trim().min(1),
  }),
  z.object({
    bodyType: z.literal(externalRequestBodyTypes.enum.formEncoded),
    formFields: z.array(externalRequestHeaderSchema),
  }),
])
export type ExternalRequestBodySchema = z.infer<
  typeof externalRequestBodySchema
>

const validateRequestFields = (
  data: {
    method: string
    headers: { key: string }[]
    body?: ExternalRequestBodySchema
  },
  ctx: z.RefinementCtx,
) => {
  const methodAllowsBody = (methodsWithBody as readonly string[]).includes(
    data.method,
  )

  if (methodAllowsBody && !data.body) {
    ctx.addIssue({
      code: "custom",
      path: ["body"],
      message: "Body is required for this HTTP method",
    })
  }

  if (!methodAllowsBody && data.body) {
    ctx.addIssue({
      code: "custom",
      path: ["body"],
      message: "Body is not supported for this HTTP method",
    })
  }

  if (hasDuplicateKeys(data.headers)) {
    ctx.addIssue({
      code: "custom",
      path: ["headers"],
      message: "Header keys must be unique",
    })
  }

  if (
    data.body?.bodyType === externalRequestBodyTypes.enum.formEncoded &&
    hasDuplicateKeys(data.body.formFields)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["body", "formFields"],
      message: "Field keys must be unique",
    })
  }
}

// Request-only fields (method/url/headers/body), reused by the "Test Now" action
// which doesn't need id/stepType/mapping/states.
export const externalRequestFieldsSchema = z
  .object({
    method: externalRequestMethods.default("GET"),
    url: z.string().trim().min(1),
    headers: z.array(externalRequestHeaderSchema),
    body: externalRequestBodySchema.optional(),
  })
  .superRefine(validateRequestFields)
export type ExternalRequestFieldsSchema = z.infer<
  typeof externalRequestFieldsSchema
>

export const externalRequestStepSchema = z
  .object({
    id: zodBigintAsString(),
    stepType: z.literal(stepTypes.enum.callApi),
    method: externalRequestMethods.default("GET"),
    url: z.string().trim().min(1),
    headers: z.array(externalRequestHeaderSchema),
    body: externalRequestBodySchema.optional(),
    mapping: z.array(
      z.object({
        jsonPath: z.string().trim().min(1),
        outputFieldId: z.string().trim().min(1),
      }),
    ),
    states: z.tuple([successStateSchema, errorStateSchema]),
  })
  .superRefine(validateRequestFields)
export type ExternalRequestStepSchema = z.infer<
  typeof externalRequestStepSchema
>

export const externalRequestStepDefaultFn = (): ExternalRequestStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.callApi,
  method: "GET",
  url: "",
  headers: [],
  body: undefined,
  mapping: [
    {
      jsonPath: "",
      outputFieldId: "",
    },
  ],
  states: [successStateDefaultFn(), errorStateDefaultFn()],
})
