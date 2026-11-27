"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { createContext, type ReactNode, useContext } from "react"

const LockedEditorContext = createContext<boolean | null>(null)

/**
 * Marks an editor page as opened from a View-only template (or not). Provided
 * by the server `LockedEditorGuard`; forms read it through `LockedContent`.
 */
export function LockedEditorProvider({
  locked,
  children,
}: {
  locked: boolean
  children: ReactNode
}) {
  return (
    <LockedEditorContext.Provider value={locked}>
      {children}
    </LockedEditorContext.Provider>
  )
}

export function useEditorLockState(): boolean | null {
  return useContext(LockedEditorContext)
}

export function useIsEditorLocked(): boolean {
  return useEditorLockState() === true
}

/**
 * Wraps ONLY the controls of a resource's content keys
 * (`TEMPLATE_LOCKED_CONTENT_KEYS`). Installer-owned controls (toggles, folder,
 * bindings) and Save stay outside it and stay enabled.
 */
export function LockedContent({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const isLocked = useIsEditorLocked()
  return (
    <fieldset
      className={cn("m-0 min-w-0 border-0 p-0", className)}
      data-testid={isLocked ? "template-locked-editor" : undefined}
      disabled={isLocked}
    >
      {children}
    </fieldset>
  )
}
