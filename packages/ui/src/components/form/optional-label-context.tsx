"use client"

import { createContext, type ReactNode, useContext } from "react"

/**
 * The marker `FormFieldWrapper` renders next to the label of a field that is
 * not `required`. packages/ui has no i18n of its own, so the app provides the
 * translated text; without a provider the marker stays "(optional)", exactly
 * as before.
 */
const FormOptionalLabelContext = createContext("(optional)")

export function FormOptionalLabelProvider({
  value,
  children,
}: {
  value: string
  children: ReactNode
}) {
  return (
    <FormOptionalLabelContext.Provider value={value}>
      {children}
    </FormOptionalLabelContext.Provider>
  )
}

export function useFormOptionalLabel() {
  return useContext(FormOptionalLabelContext)
}
