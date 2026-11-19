"use client"

import { createContext, type ReactNode, useContext, useMemo } from "react"

const NO_PAGES: ReadonlySet<string> = new Set()

/**
 * The connect session's pages that AhaChat has (`findConnectPagesOnAhachat`,
 * read on the server and handed down by the select page), so the picker asks
 * "use data from AhaChat?" only for them. Empty unless a page says otherwise:
 * a picker rendered without the provider never asks.
 */
const AhachatPagesContext = createContext<ReadonlySet<string>>(NO_PAGES)

export function AhachatImportAvailability({
  pageIds,
  children,
}: {
  pageIds: string[]
  children: ReactNode
}) {
  const value = useMemo(() => new Set(pageIds), [pageIds])
  return (
    <AhachatPagesContext.Provider value={value}>
      {children}
    </AhachatPagesContext.Provider>
  )
}

export function useAhachatPageIds(): ReadonlySet<string> {
  return useContext(AhachatPagesContext)
}
