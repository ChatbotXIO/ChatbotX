/**
 * These are defined in `@chatbotx.io/utils/contact-filter-value-format` so a
 * "use client" component (e.g. the contact-filter condition dialog) can use
 * them without depending on the database package. Re-exported here because
 * this has long been the import site for the rest of the repo; both paths
 * resolve to the same values. Mirrors the `channelTypes` precedent.
 */
export {
  DATETIME_VALUE_PATTERN,
  isValidDateTimeFilterValue,
  NUMERIC_VALUE_PATTERN,
  valueContainsVariablePlaceholder,
} from "@chatbotx.io/utils/contact-filter-value-format"
