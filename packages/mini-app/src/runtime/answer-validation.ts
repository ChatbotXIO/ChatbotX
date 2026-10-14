import { isTextInputDateType, TEXT_INPUT_DATE_FORMATS } from "../components"
import type { MiniAppNode } from "../types"

/** Why the runner refuses an answer before moving on. */
export type MiniAppAnswerErrorCode =
  | "required"
  | "invalidEmail"
  | "invalidFormat"
  | "tooShort"
  | "selectMore"
  | "selectFewer"
  | "uploadMore"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The prop holding a file picker's minimum number of files. */
const PICKER_MIN_FILES_PROP: Partial<Record<MiniAppNode["type"], string>> = {
  PhotoPicker: "min-uploaded-photos",
  DocumentPicker: "min-uploaded-documents",
}

const isEmptyAnswer = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === "" ||
  value === false ||
  (Array.isArray(value) && value.length === 0)

/** Whether `text` fails a pattern; an invalid pattern is the editor's to report, not the visitor's. */
const failsPattern = (pattern: string, text: string): boolean => {
  try {
    return !new RegExp(pattern).test(text)
  } catch {
    return false
  }
}

const validateTextInput = (
  props: Record<string, unknown>,
  value: string,
): MiniAppAnswerErrorCode | undefined => {
  const inputType = props["input-type"]
  if (inputType === "email" && !EMAIL_PATTERN.test(value)) {
    return "invalidEmail"
  }
  if (
    isTextInputDateType(inputType) &&
    failsPattern(TEXT_INPUT_DATE_FORMATS[inputType].pattern, value)
  ) {
    return "invalidFormat"
  }
  if (
    typeof props.pattern === "string" &&
    props.pattern &&
    failsPattern(props.pattern, value)
  ) {
    return "invalidFormat"
  }
  const minChars = props["min-chars"]
  if (typeof minChars === "number" && value.length < minChars) {
    return "tooShort"
  }
  return
}

const validateSelection = (
  props: Record<string, unknown>,
  selected: unknown[],
): MiniAppAnswerErrorCode | undefined => {
  const min = props["min-selected-items"]
  const max = props["max-selected-items"]
  if (typeof min === "number" && selected.length < min) {
    return "selectMore"
  }
  if (typeof max === "number" && selected.length > max) {
    return "selectFewer"
  }
  return
}

/** Checks one input's answer against its props, as WhatsApp would before moving on. */
export const validateAnswer = (
  node: MiniAppNode,
  value: unknown,
): MiniAppAnswerErrorCode | undefined => {
  const props = node.props
  const minFilesProp = PICKER_MIN_FILES_PROP[node.type]
  if (minFilesProp) {
    const count = Array.isArray(value) ? value.length : 0
    const min = props[minFilesProp]
    return typeof min === "number" && count < min ? "uploadMore" : undefined
  }
  if (isEmptyAnswer(value)) {
    return props.required === true ? "required" : undefined
  }
  if (node.type === "TextInput" && typeof value === "string") {
    const error = validateTextInput(props, value)
    if (error) {
      return error
    }
  }
  return Array.isArray(value) ? validateSelection(props, value) : undefined
}
