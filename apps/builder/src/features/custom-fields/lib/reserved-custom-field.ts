import {
  CustomFieldType,
  type ReservedCustomFieldNames,
  reservedCustomFieldNames,
} from "@aha.chat/database/types"

export const reservedCustomFieldOptions: {
  label: string
  type: CustomFieldType
  value: ReservedCustomFieldNames
}[] = [
  {
    label: "First Name",
    value: reservedCustomFieldNames.first_name,
    type: CustomFieldType.shortText,
  },
  {
    label: "Last Name",
    value: reservedCustomFieldNames.last_name,
    type: CustomFieldType.shortText,
  },
  {
    label: "Full Name",
    value: reservedCustomFieldNames.full_name,
    type: CustomFieldType.shortText,
  },
  {
    label: "Email",
    value: reservedCustomFieldNames.email,
    type: CustomFieldType.shortText,
  },
  {
    label: "Phone Number",
    value: reservedCustomFieldNames.phone_number,
    type: CustomFieldType.shortText,
  },
  {
    label: "Avatar",
    value: reservedCustomFieldNames.avatar,
    type: CustomFieldType.shortText,
  },
  {
    label: "Locale",
    value: reservedCustomFieldNames.locale,
    type: CustomFieldType.shortText,
  },
  {
    label: "Gender",
    value: reservedCustomFieldNames.gender,
    type: CustomFieldType.shortText,
  },
  {
    label: "Timezone",
    value: reservedCustomFieldNames.timezone,
    type: CustomFieldType.shortText,
  },
  {
    label: "User ID",
    value: reservedCustomFieldNames.user_id,
    type: CustomFieldType.shortText,
  },
  {
    label: "User Tags",
    value: reservedCustomFieldNames.user_tags,
    type: CustomFieldType.shortText,
  },
  {
    label: "Account Name",
    value: reservedCustomFieldNames.account_name,
    type: CustomFieldType.shortText,
  },
  {
    label: "Account ID",
    value: reservedCustomFieldNames.account_id,
    type: CustomFieldType.shortText,
  },
  {
    label: "Page User Name",
    value: reservedCustomFieldNames.page_user_name,
    type: CustomFieldType.shortText,
  },
  {
    label: "Last Input",
    value: reservedCustomFieldNames.last_input,
    type: CustomFieldType.shortText,
  },
  {
    label: "Current Time",
    value: reservedCustomFieldNames.current_time,
    type: CustomFieldType.shortText,
  },
]
