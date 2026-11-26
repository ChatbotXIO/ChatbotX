"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { previewTranslationAction } from "../actions/preview-text.action"

export type TranslationPreview =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ready"
      translated: string
      /** The sentence and customer language this translation is for. */
      sourceText: string
      language: string
    }
  | {
      /** The sentence or the language changed since: ask again, never overwrite. */
      status: "stale"
      translated: string
      sourceText: string
      language: string
    }
  | { status: "failed" }

/**
 * The composer's translation preview. It never translates while the agent types:
 * the composer asks for it (`translate`) when the agent presses Enter, so a
 * sentence costs one model call. Once a translation exists it is the agent's to
 * edit, so a later change to the sentence or the language only marks it `stale`
 * and the next Enter (or "Translate again") translates again. A response that
 * arrives after a newer request is dropped.
 */
export function useTranslationPreview(props: {
  conversationId: string | null
  text: string
  language: string | null
  /** Preview is on, translation applies, and the language is known. */
  enabled: boolean
}) {
  const { conversationId, text, language, enabled } = props
  const workspaceId = useWorkspaceId()
  const [preview, setPreview] = useState<TranslationPreview>({ status: "idle" })
  const latestRequest = useRef(0)

  const translate = useCallback(async () => {
    const sourceText = text.trim()
    if (!(conversationId && language && sourceText)) {
      return
    }
    const request = latestRequest.current + 1
    latestRequest.current = request
    setPreview({ status: "loading" })
    try {
      const result = await previewTranslationAction(
        workspaceId,
        conversationId,
        {
          text: sourceText,
        },
      )
      if (request !== latestRequest.current) {
        return
      }
      const data = result?.data
      setPreview(
        data
          ? {
              status: "ready",
              translated: data.translatedText,
              sourceText,
              language,
            }
          : { status: "failed" },
      )
    } catch {
      if (request === latestRequest.current) {
        setPreview({ status: "failed" })
      }
    }
  }, [conversationId, language, text, workspaceId])

  // Everything starts over when preview is switched off or the conversation
  // changes; an empty box clears it (the agent sent or erased the sentence).
  useEffect(() => {
    if (!enabled || text.trim() === "") {
      latestRequest.current += 1
      setPreview({ status: "idle" })
    }
  }, [enabled, text])

  // biome-ignore lint/correctness/useExhaustiveDependencies: the conversation id is the trigger
  useEffect(() => {
    latestRequest.current += 1
    setPreview({ status: "idle" })
  }, [conversationId])

  // A translation exists and its inputs moved on: mark it stale.
  useEffect(() => {
    if (preview.status !== "ready") {
      return
    }
    if (preview.sourceText !== text.trim() || preview.language !== language) {
      setPreview({ ...preview, status: "stale" })
    }
  }, [language, preview, text])

  const edit = useCallback((translated: string) => {
    setPreview((current) =>
      current.status === "ready" || current.status === "stale"
        ? { ...current, translated }
        : current,
    )
  }, [])

  const reset = useCallback(() => {
    latestRequest.current += 1
    setPreview({ status: "idle" })
  }, [])

  return { preview, translate, edit, reset }
}
