"use client"

import { FormItem, FormLabel } from "@/components/ui/form"
import type { ReactNode } from "react"

interface OpenAIFormItemProps {
  label?: string
  isOptions?: boolean
  children?: ReactNode
}

export const OpenAIFormItem = ({
  label,
  isOptions = false,
  children,
}: OpenAIFormItemProps) => {
  return (
    <FormItem>
      {label && (
        <FormLabel>
          {label}
          {isOptions ? (
            <span className="text-[12px] text-gray-500 pl-1">(Options)</span>
          ) : null}
        </FormLabel>
      )}
      {children}
    </FormItem>
  )
}
