/** Keys of the texts a freshly created component starts with. */
export type MiniAppDefaultTextKey =
  | "heading"
  | "subheading"
  | "body"
  | "caption"
  | "richText"
  | "textInputLabel"
  | "textAreaLabel"
  | "dropdownLabel"
  | "radioLabel"
  | "checkboxLabel"
  | "chipsLabel"
  | "dateLabel"
  | "calendarLabel"
  | "optInLabel"
  | "photoLabel"
  | "documentLabel"
  | "linkText"
  | "footerLabel"
  | "option"
  | "navigationItem"
  | "imageAlt"

export type MiniAppDefaultText = (key: MiniAppDefaultTextKey) => string

export const defaultMiniAppText: MiniAppDefaultText = (key) =>
  ({
    heading: "Heading",
    subheading: "Subheading",
    body: "Body text",
    caption: "Caption",
    richText: "## Title\n\nSome **rich** text.",
    textInputLabel: "Your answer",
    textAreaLabel: "Details",
    dropdownLabel: "Choose one",
    radioLabel: "Choose one",
    checkboxLabel: "Choose any",
    chipsLabel: "Choose any",
    dateLabel: "Date",
    calendarLabel: "Date",
    optInLabel: "I agree to the terms",
    photoLabel: "Upload photos",
    documentLabel: "Upload documents",
    linkText: "Learn more",
    footerLabel: "Continue",
    option: "Option",
    navigationItem: "Item",
    imageAlt: "Image",
  })[key]

/** A 1×1 light-grey PNG, used as the placeholder for new images. */
export const MINI_APP_PLACEHOLDER_IMAGE =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC"

/** The first Switch case of a new Switch. */
export const MINI_APP_FIRST_SWITCH_CASE = "case_1"
