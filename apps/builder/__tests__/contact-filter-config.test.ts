// @vitest-environment node

import {
  contactLanguageOptions,
  contactLocaleOptions,
} from "@chatbotx.io/business/contact-locale"
import {
  contactSources,
  formFieldTypes,
  operatorTypes,
} from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import { buildConditionDraft } from "@/features/contact-filter/components/contact-filter-condition-form"
import {
  convertCustomFieldTypeToConditionType,
  type FieldConfig,
  formatConditionValueDisplay,
  getConditionOptions,
  getFieldConfigs,
  getFieldOptions,
} from "@/features/contact-filter/components/contact-filter-config"
import {
  customFieldOperatorRequiresArrayValue,
  getCustomFieldConditionOptions,
  getCustomFieldValueInputConfig,
  getDefaultCustomFieldValue,
} from "@/features/contact-filter/components/custom-field-filter-config"
import {
  getDefaultStaticFieldValue,
  getStaticFieldConditionOptions,
  getStaticFieldValueInputConfig,
  staticFieldOperatorRequiresArrayValue,
} from "@/features/contact-filter/components/static-field-filter-config"

const t = (key: string) => key
const conditionOptions = getConditionOptions(t)
const CONTACT_LANGUAGE_VALUE_RE = /^[a-z]+$/

const option = (
  options: { value: string; disabled?: boolean }[],
  value: string,
) => options.find((item) => item.value === value)

describe("contact filter operator config", () => {
  test("disables unsupported static operators for boolean fields", () => {
    const config: FieldConfig = {
      name: "blocked",
      formField: formFieldTypes.enum.boolean,
      group: "contactInfo",
    }

    const options = getStaticFieldConditionOptions(config, conditionOptions)

    expect(option(options, operatorTypes.enum.eq)?.disabled).toBe(false)
    expect(option(options, operatorTypes.enum.isEmpty)?.disabled).toBe(false)
    expect(option(options, operatorTypes.enum.contains)?.disabled).toBe(true)
    expect(option(options, operatorTypes.enum.isBetween)?.disabled).toBe(true)
  })

  test("disables empty operators for non-nullable boolean fields", () => {
    for (const name of ["emailWasVerified", "optedInForEmail"]) {
      const config: FieldConfig = {
        name,
        formField: formFieldTypes.enum.boolean,
        group: "email",
      }

      const options = getStaticFieldConditionOptions(config, conditionOptions)

      expect(option(options, operatorTypes.enum.eq)?.disabled).toBe(false)
      expect(option(options, operatorTypes.enum.isEmpty)?.disabled).toBe(true)
    }
  })

  test("enables all number custom-field operator families", () => {
    const config: FieldConfig = {
      name: "customField:cf-1",
      customFieldId: "cf-1",
      customFieldType: "number",
      formField: formFieldTypes.enum.number,
      group: "customFields",
    }

    const options = getCustomFieldConditionOptions(config, conditionOptions)

    expect(options).toHaveLength(14)
    expect(options.every((item) => item.disabled === false)).toBe(true)
  })
})

describe("contact filter value-input config", () => {
  test("returns static input kinds and defaults by field/operator", () => {
    const dateConfig: FieldConfig = {
      name: "lastSeen",
      formField: formFieldTypes.enum.datetime,
      group: "analytics",
    }

    expect(
      getStaticFieldValueInputConfig(dateConfig, operatorTypes.enum.isBetween),
    ).toEqual({ kind: "datetimeInterval", defaultValue: ["", ""] })
    expect(
      getDefaultStaticFieldValue(dateConfig, operatorTypes.enum.isBetween),
    ).toEqual(["", ""])
    expect(
      staticFieldOperatorRequiresArrayValue(
        dateConfig,
        operatorTypes.enum.isBetween,
      ),
    ).toBe(true)
    expect(
      getStaticFieldValueInputConfig(dateConfig, operatorTypes.enum.isEmpty),
    ).toEqual({ kind: "none", defaultValue: "" })
  })

  test("returns custom input kinds and defaults by type/operator", () => {
    const numberConfig: FieldConfig = {
      name: "customField:cf-1",
      customFieldId: "cf-1",
      customFieldType: "number",
      formField: formFieldTypes.enum.number,
      group: "customFields",
    }

    expect(
      getCustomFieldValueInputConfig(
        numberConfig,
        operatorTypes.enum.isBetween,
      ),
    ).toEqual({ kind: "numberInterval", defaultValue: ["0", "0"] })
    expect(
      getDefaultCustomFieldValue(numberConfig, operatorTypes.enum.isBetween),
    ).toEqual(["0", "0"])
    expect(
      customFieldOperatorRequiresArrayValue(operatorTypes.enum.isBetween),
    ).toBe(true)
  })
})

describe("contact filter field config helpers", () => {
  test("maps workspace custom fields to customField configs", () => {
    const configs = getFieldConfigs({
      t,
      tagOptions: [{ label: "VIP", value: "tag-1" }],
      inboxOptions: [{ label: "Inbox", value: "inbox-1" }],
      flowVersionOptions: [],
      customFields: [
        { id: "cf-1", name: "Plan", type: "shortText" },
        { id: "cf-2", name: "Age", type: "number" },
      ],
    })

    expect(configs).toContainEqual(
      expect.objectContaining({
        name: "customField:cf-1",
        customFieldId: "cf-1",
        customFieldType: "shortText",
        label: "Plan",
        formField: formFieldTypes.enum.text,
        group: "customFields",
      }),
    )
    expect(configs).toContainEqual(
      expect.objectContaining({
        name: "customField:cf-2",
        formField: formFieldTypes.enum.number,
      }),
    )
  })

  test("assigns supported static fields to their configured option groups", () => {
    const configs = getFieldConfigs({
      t,
      tagOptions: [],
      inboxOptions: [],
      flowVersionOptions: [],
      customFields: [],
    })
    const groupFor = (name: string) =>
      configs.find((config) => config.name === name)?.group

    expect(groupFor("fullName")).toBe("contactInfo")
    expect(groupFor("locale")).toBe("contactInfo")
    expect(groupFor("language")).toBe("contactInfo")
    expect(groupFor("timezone")).toBe("contactInfo")
    expect(groupFor("tags")).toBe("analytics")
    expect(groupFor("lastSeen")).toBe("analytics")
    expect(groupFor("lastInteraction")).toBe("analytics")
    expect(groupFor("phone")).toBe("sms")
    expect(groupFor("email")).toBe("email")
    expect(groupFor("emailWasVerified")).toBe("email")
    expect(groupFor("optedInForEmail")).toBe("email")
  })

  test("derives contact source options from the contact source taxonomy", () => {
    const configs = getFieldConfigs({
      t,
      tagOptions: [],
      inboxOptions: [],
      flowVersionOptions: [],
      customFields: [],
    })
    const sourceOptions = configs.find(
      (config) => config.name === "source",
    )?.options

    expect(sourceOptions?.map((option) => option.value)).toEqual(
      contactSources.options,
    )
    expect(sourceOptions?.map((option) => option.value)).not.toContain(
      "fbLeadAd",
    )
  })

  test("keeps locale labels from template language options and appends stored locale values", () => {
    const configs = getFieldConfigs({
      t,
      tagOptions: [],
      inboxOptions: [],
      flowVersionOptions: [],
      customFields: [],
    })
    const localeOptions = configs.find(
      (config) => config.name === "locale",
    )?.options

    expect(localeOptions).toEqual(
      expect.arrayContaining([
        { label: "English (US)", value: "en_US" },
        { label: "English (UK)", value: "en_GB" },
        { label: "Arabic (UAE)", value: "ar_AE" },
      ]),
    )
    expect(localeOptions?.map((option) => option.value)).toEqual(
      expect.arrayContaining(
        contactLocaleOptions.map((option) => option.value),
      ),
    )
    const contactLocaleValues = new Set(
      contactLocaleOptions.map((option) => option.value),
    )
    expect(
      localeOptions
        ?.filter((option) => contactLocaleValues.has(option.value))
        .every((option) => option.label !== option.value),
    ).toBe(true)
    expect(localeOptions).toContainEqual({
      label: "condition.languages.vi",
      value: "vi_VN",
    })
  })

  test("uses bare contact language values with human labels", () => {
    const configs = getFieldConfigs({
      t,
      tagOptions: [],
      inboxOptions: [],
      flowVersionOptions: [],
      customFields: [],
    })
    const languageOptions = configs.find(
      (config) => config.name === "language",
    )?.options

    expect(languageOptions?.map((option) => option.value)).toEqual(
      contactLanguageOptions.map((option) => option.value),
    )
    expect(
      languageOptions?.every((option) =>
        CONTACT_LANGUAGE_VALUE_RE.test(option.value),
      ),
    ).toBe(true)
    expect(
      languageOptions?.every((option) => option.label !== option.value),
    ).toBe(true)
  })

  test("uses curated contact timezone option list", () => {
    const configs = getFieldConfigs({
      t,
      tagOptions: [],
      inboxOptions: [],
      flowVersionOptions: [],
      customFields: [],
    })

    expect(
      configs
        .find((config) => config.name === "timezone")
        ?.options?.map((option) => option.value),
    ).toContain("Asia/Ho_Chi_Minh")
  })

  test("groups field options and keeps contact-info fields flat", () => {
    const configs: FieldConfig[] = [
      {
        name: "fullName",
        formField: formFieldTypes.enum.text,
        group: "contactInfo",
      },
      {
        name: "tags",
        formField: formFieldTypes.enum.multiSelect,
        group: "analytics",
      },
      {
        name: "customField:cf-1",
        customFieldId: "cf-1",
        label: "Plan",
        formField: formFieldTypes.enum.text,
        group: "customFields",
      },
    ]

    const options = getFieldOptions(configs, t)

    expect(options[0]).toEqual({
      label: "condition.fields.fullName",
      value: "fullName",
    })
    expect(options).toContainEqual(
      expect.objectContaining({
        value: "group-analytics",
        children: [
          {
            label: "condition.fields.tags",
            value: "tags",
          },
        ],
      }),
    )
    expect(options).toContainEqual(
      expect.objectContaining({
        value: "group-customFields",
        children: [
          {
            label: "Plan",
            value: "customField:cf-1",
          },
        ],
      }),
    )
  })

  test("converts custom field types and formats values for display", () => {
    expect(convertCustomFieldTypeToConditionType("number")).toBe(
      formFieldTypes.enum.number,
    )
    expect(convertCustomFieldTypeToConditionType("datetime")).toBe(
      formFieldTypes.enum.datetime,
    )
    expect(convertCustomFieldTypeToConditionType("boolean")).toBe(
      formFieldTypes.enum.boolean,
    )
    expect(convertCustomFieldTypeToConditionType("unknown")).toBe(
      formFieldTypes.enum.text,
    )

    expect(
      formatConditionValueDisplay(
        ["tag-1", "missing"],
        [{ label: "VIP", value: "tag-1" }],
      ),
    ).toBe("VIP, missing")
  })
})

describe("buildConditionDraft", () => {
  test("passes static value conditions through and omits value for valueless operators", () => {
    expect(
      buildConditionDraft(
        {
          field: "email",
          operator: operatorTypes.enum.eq,
          value: "a@example.com",
        },
        undefined,
      ),
    ).toEqual({
      field: "email",
      operator: operatorTypes.enum.eq,
      value: "a@example.com",
    })

    expect(
      buildConditionDraft(
        {
          field: "email",
          operator: operatorTypes.enum.isNotEmpty,
          value: "ignored",
        },
        undefined,
      ),
    ).toEqual({
      field: "email",
      operator: operatorTypes.enum.isNotEmpty,
    })
  })

  test("maps custom field config to dynamic customField condition shape", () => {
    const config: FieldConfig = {
      name: "customField:cf-1",
      customFieldId: "cf-1",
      customFieldType: "number",
      formField: formFieldTypes.enum.number,
      group: "customFields",
    }

    expect(
      buildConditionDraft(
        {
          field: "customField:cf-1",
          operator: operatorTypes.enum.gt,
          value: "10",
        },
        config,
      ),
    ).toEqual({
      field: "customField",
      customFieldId: "cf-1",
      customFieldType: "number",
      valueType: formFieldTypes.enum.number,
      operator: operatorTypes.enum.gt,
      value: "10",
    })
  })
})
