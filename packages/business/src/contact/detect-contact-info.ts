import type { ContactInfoCaptureInfoType } from "@chatbotx.io/flow-config"
import {
  type ExtractedContactInfo,
  extractContactInfo,
  MIN_EXTRACT_LENGTH,
} from "./extract-contact"

/** Maps an extractor result to the kinds only; the values never leave this function. */
export const toContactInfoCaptureTypes = (
  extracted: ExtractedContactInfo,
): ContactInfoCaptureInfoType[] => [
  ...(extracted.phoneNumber ? (["phone"] as const) : []),
  ...(extracted.email ? (["email"] as const) : []),
]

/**
 * Pure and channel-agnostic: which kinds of contact info (phone / email) the
 * text contains, without storing or returning the values. For channels that do
 * not write the extracted values into the Contact but still report the kinds
 * (the "left a phone / email" statistic). `defaultCountry` is the workspace's
 * target country; without one the extractor falls back to its default regions
 * (VN, US).
 */
export const detectContactInfoTypes = (
  text: string | null | undefined,
  defaultCountry: string | null | undefined,
): ContactInfoCaptureInfoType[] => {
  if (!text || text.length < MIN_EXTRACT_LENGTH) {
    return []
  }
  return toContactInfoCaptureTypes(
    extractContactInfo(text, defaultCountry ?? null),
  )
}
