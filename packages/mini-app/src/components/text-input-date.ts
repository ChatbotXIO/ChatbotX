/**
 * TextInput types Meta has no keyboard for. They are sent to WhatsApp as a
 * text input checked by this pattern; the web runner shows a native picker.
 */
export const TEXT_INPUT_DATE_FORMATS = {
  date: {
    pattern: "^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$",
    helperText: "YYYY-MM-DD",
  },
  datetime: {
    pattern:
      "^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])[ T]([01]\\d|2[0-3]):[0-5]\\d$",
    helperText: "YYYY-MM-DD HH:mm",
  },
} as const
export type TextInputDateType = keyof typeof TEXT_INPUT_DATE_FORMATS

export const isTextInputDateType = (
  value: unknown,
): value is TextInputDateType =>
  typeof value === "string" && value in TEXT_INPUT_DATE_FORMATS
