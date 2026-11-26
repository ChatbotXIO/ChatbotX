import type { TranslationPreview } from "../hooks/use-translation-preview"

/** What pressing Enter (or Send) does while the translation preview is on. */
export type PreviewSendDecision =
  /** Send now. */
  | "send"
  /** Translate and show the preview; the next Enter sends it. */
  | "translate"
  /** A translation is already on its way: do nothing. */
  | "wait"

/**
 * Enter is the preview's trigger, so the agent always sends what was on screen:
 * the first Enter translates, the next one sends it. A failed preview does not
 * trap the agent: the next Enter sends and the server translates (or sends the
 * original) as it does without a preview. With preview off, translation off or
 * nothing typed, Enter sends exactly as before.
 */
export function decidePreviewSend(input: {
  previewEnabled: boolean
  translationActive: boolean
  text: string
  language: string | null
  preview: TranslationPreview
}): PreviewSendDecision {
  const { preview } = input
  const sourceText = input.text.trim()
  if (!(input.previewEnabled && input.translationActive) || sourceText === "") {
    return "send"
  }
  if (preview.status === "loading") {
    return "wait"
  }
  if (preview.status === "failed") {
    return "send"
  }
  const isCurrent =
    preview.status === "ready" &&
    preview.sourceText === sourceText &&
    preview.language === input.language
  return isCurrent ? "send" : "translate"
}
