"use client"

import { createContext, type ReactNode, useContext } from "react"
import type { CredentialScope } from "../scope"

const CredentialScopeContext = createContext<CredentialScope>("user")

export function CredentialScopeProvider({
  scope,
  children,
}: {
  scope: CredentialScope
  children: ReactNode
}) {
  return (
    <CredentialScopeContext.Provider value={scope}>
      {children}
    </CredentialScopeContext.Provider>
  )
}

export function useCredentialScope(): CredentialScope {
  return useContext(CredentialScopeContext)
}
