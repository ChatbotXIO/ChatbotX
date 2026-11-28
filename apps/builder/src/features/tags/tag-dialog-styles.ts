/** Shared look of the create and edit tag dialogs (exact px values on purpose). */

export const TAG_DIALOG_CONTENT_CLASS =
  "max-h-screen w-[500px] max-w-[min(500px,calc(100%-2rem))] gap-0 overflow-y-auto rounded-2xl bg-white p-0 text-sm leading-[22px] text-[#1D2939] shadow-[0_6px_16px_0_rgba(0,0,0,0.08),0_3px_6px_-4px_rgba(0,0,0,0.12),0_9px_28px_8px_rgba(0,0,0,0.05)] ring-0 sm:max-w-[min(500px,calc(100%-2rem))] dark:bg-popover dark:text-popover-foreground"

export const TAG_DIALOG_HEADER_CLASS = "gap-0 px-6 pt-4 pb-3"

export const TAG_DIALOG_TITLE_CLASS =
  "font-medium text-base text-black/[0.88] leading-6 dark:text-popover-foreground"

/** The form is the body; labels are 14px/22px regular, never 13px medium. */
export const TAG_DIALOG_FORM_CLASS =
  "[&_[data-slot=label]]:font-normal [&_[data-slot=label]]:text-sm [&_[data-slot=label]]:leading-[22px] [&_[data-slot=label]]:text-[#1D2939] dark:[&_[data-slot=label]]:text-popover-foreground"

export const TAG_DIALOG_BODY_CLASS = "px-6"

/** Name field block: 24px under it, the control 8px under its label. */
export const TAG_DIALOG_FIELD_CLASS = "mb-6"

export const TAG_DIALOG_INPUT_CLASS =
  "h-[34px] rounded-md border-[#D0D5DD] bg-white px-3 py-[5px] text-sm leading-[22px] md:text-sm dark:border-input dark:bg-input/30"

export const TAG_DIALOG_FOOTER_CLASS = "flex justify-end gap-2 px-6 pt-4 pb-5"

const BUTTON_BASE =
  "h-8 rounded-lg border px-3 py-[5px] font-medium text-sm leading-[22px]"

export const TAG_DIALOG_CANCEL_CLASS = `${BUTTON_BASE} border-[#EAECF0] bg-[#EAECF0] text-[#344054] hover:border-[#DDE1E8] hover:bg-[#DDE1E8] dark:border-secondary dark:bg-secondary dark:text-secondary-foreground dark:hover:border-secondary/80 dark:hover:bg-secondary/80`

export const TAG_DIALOG_CONFIRM_CLASS = `${BUTTON_BASE} border-[#105CE2] bg-[#105CE2] text-white hover:border-[#0B4FC4] hover:bg-[#0B4FC4]`
