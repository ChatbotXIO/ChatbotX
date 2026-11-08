import { normalizeLanguage } from "../contact-locale"

export type AppointmentSchedulingCopy = {
  bookingPrompt: string
  bookingButton: string
  rangePrompt: string
  rangeButton: string
  noSlotsFound: string
}

/**
 * Contact-facing copy for appointment booking messages, shared by the
 * appointmentScheduling flow step and inbox booking links.
 */
const APPOINTMENT_SCHEDULING_COPY = {
  en: {
    bookingPrompt: "Choose an appointment time",
    bookingButton: "Select Date",
    rangePrompt: "Choose a date range to check availability",
    rangeButton: "Check Availability",
    noSlotsFound: "No available slots found.",
  },
  vi: {
    bookingPrompt: "Chọn thời gian đặt lịch",
    bookingButton: "Chọn ngày",
    rangePrompt: "Chọn khoảng ngày cần kiểm tra lịch trống",
    rangeButton: "Kiểm tra lịch trống",
    noSlotsFound: "Không có lịch trống.",
  },
} satisfies Record<string, AppointmentSchedulingCopy>

export function getAppointmentSchedulingCopy(input: {
  language?: string | null
}): AppointmentSchedulingCopy {
  return normalizeLanguage(input.language) === "vi"
    ? APPOINTMENT_SCHEDULING_COPY.vi
    : APPOINTMENT_SCHEDULING_COPY.en
}
