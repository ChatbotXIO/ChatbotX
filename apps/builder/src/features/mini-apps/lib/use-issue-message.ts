"use client"

import type {
  MiniAppComponentType,
  MiniAppValidationIssue,
} from "@chatbotx.io/mini-app"
import { useTranslations } from "next-intl"
import { useCallback } from "react"
import {
  componentLabelKey,
  isPropertyKey,
  issueLabelKey,
  propertyLabelKey,
} from "./labels"

const isComponentType = (value: unknown): value is MiniAppComponentType =>
  typeof value === "string" && value in componentLabelKey

/** Turns a validation issue into a translated sentence. */
export function useIssueMessage() {
  const t = useTranslations()
  return useCallback(
    (issue: MiniAppValidationIssue): string => {
      const params = issue.params ?? {}
      const rootProperty = issue.property?.split(".")[0] ?? ""
      const property = isPropertyKey(rootProperty)
        ? t(propertyLabelKey[rootProperty])
        : rootProperty
      const type = isComponentType(params.type)
        ? t(componentLabelKey[params.type])
        : String(params.type ?? "")
      const parent = isComponentType(params.parent)
        ? t(componentLabelKey[params.parent])
        : String(params.parent ?? "")
      return t(issueLabelKey[issue.code], {
        property,
        type,
        parent,
        max: params.max ?? "",
        min: params.min ?? "",
        name: params.name ?? "",
        reference: params.reference ?? "",
      })
    },
    [t],
  )
}
