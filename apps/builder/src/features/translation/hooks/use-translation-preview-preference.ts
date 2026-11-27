"use client"

import { useCallback, useEffect, useState } from "react"
import { authClient } from "@/lib/auth/auth-client"

const storageKey = (userId: string) => `inbox-translation-preview:${userId}`

const read = (userId: string): boolean => {
  try {
    return window.localStorage.getItem(storageKey(userId)) === "1"
  } catch {
    return false
  }
}

const write = (userId: string, value: boolean): void => {
  try {
    window.localStorage.setItem(storageKey(userId), value ? "1" : "0")
  } catch {
    // Best effort: blocked storage only loses the remembered choice.
  }
}

/**
 * Whether this agent wants to review the translation before sending. Off by
 * default and remembered per user in this browser (never shared: it is a
 * personal convenience, not workspace state). Read after mount so the server
 * and client render the same first frame.
 */
export const useTranslationPreviewPreference = (): [
  boolean,
  (next: boolean) => void,
] => {
  const session = authClient.useSession()
  const userId = session.data?.user.id ?? ""
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    if (userId) {
      setEnabled(read(userId))
    }
  }, [userId])

  const update = useCallback(
    (next: boolean) => {
      setEnabled(next)
      if (userId) {
        write(userId, next)
      }
    },
    [userId],
  )
  return [enabled, update]
}
