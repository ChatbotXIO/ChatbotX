"use client"

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"

type SpreadsheetDialogContextValue = {
  openKey: string | null
  setOpenKey: (key: string | null) => void
}

const SpreadsheetDialogContext =
  createContext<SpreadsheetDialogContextValue | null>(null)

/**
 * Coordinates the open state of every spreadsheet-step dialog rendered inside
 * the same node/button editor so that only one can be open at a time. Opening a
 * new spreadsheet step automatically closes the previously open one instead of
 * stacking overlapping dialogs.
 */
export const SpreadsheetDialogProvider = ({
  children,
}: {
  children: ReactNode
}) => {
  const [openKey, setOpenKey] = useState<string | null>(null)

  const value = useMemo(() => ({ openKey, setOpenKey }), [openKey])

  return (
    <SpreadsheetDialogContext.Provider value={value}>
      {children}
    </SpreadsheetDialogContext.Provider>
  )
}

/**
 * Returns the open state for a single spreadsheet dialog keyed by its unique
 * form path (e.g. `steps.0`). When a provider is present, only one key stays
 * open across all sibling dialogs; without a provider it falls back to local
 * state so the editor still works in isolation.
 */
export const useSpreadsheetDialogOpen = (
  key: string,
): readonly [boolean, (open: boolean) => void] => {
  const context = useContext(SpreadsheetDialogContext)
  const [localOpen, setLocalOpen] = useState(false)

  const open = context ? context.openKey === key : localOpen

  const setOpen = useCallback(
    (next: boolean) => {
      if (context) {
        context.setOpenKey(next ? key : null)
      } else {
        setLocalOpen(next)
      }
    },
    [context, key],
  )

  return [open, setOpen] as const
}
