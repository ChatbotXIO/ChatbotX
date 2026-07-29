// @vitest-environment node

import { formFieldTypes, operatorTypes } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import {
  buildConditionDraft,
  buildDraftFromCondition,
  getConditionOptionsForConfig,
  getDefaultConditionValue,
  getResetDraftForField,
} from "@/features/contact-filter/components/contact-filter-condition-dialog"
import {
  type FieldConfig,
  getConditionOptions,
} from "@/features/contact-filter/components/contact-filter-config"
import {
  getCustomFieldConditionOptions,
  getDefaultCustomFieldValue,
} from "@/features/contact-filter/components/custom-field-filter-config"
import {
  getDefaultStaticFieldValue,
  getStaticFieldConditionOptions,
} from "@/features/contact-filter/components/static-field-filter-config"
import type { ContactFilterCondition } from "@/features/contact-filter/schemas"

const t = (key: string) => key
const conditionOptions = getConditionOptions(t)

const emailConfig: FieldConfig = {
  name: "email",
  formField: formFieldTypes.enum.text,
  group: "email",
}

const tagConfig: FieldConfig = {
  name: "tags",
  formField: formFieldTypes.enum.multiSelect,
  group: "analytics",
  options: [
    { label: "Tag 1", value: "t1" },
    { label: "Tag 2", value: "t2" },
  ],
}

const genderConfig: FieldConfig = {
  name: "gender",
  formField: formFieldTypes.enum.select,
  group: "contactInfo",
  options: [{ label: "Female", value: "female" }],
}

const numberCustomFieldConfig: FieldConfig = {
  name: "customField:cf-1",
  customFieldId: "cf-1",
  customFieldType: "number",
  formField: formFieldTypes.enum.number,
  group: "customFields",
}

const datetimeCustomFieldConfig: FieldConfig = {
  name: "customField:cf-date",
  customFieldId: "cf-date",
  customFieldType: "datetime",
  formField: formFieldTypes.enum.datetime,
  group: "customFields",
}

const dateCustomFieldConfig: FieldConfig = {
  name: "customField:cf-birthday",
  customFieldId: "cf-birthday",
  customFieldType: "date",
  formField: formFieldTypes.enum.datetime,
  group: "customFields",
}

const booleanCustomFieldConfig: FieldConfig = {
  name: "customField:cf-bool",
  customFieldId: "cf-bool",
  customFieldType: "boolean",
  formField: formFieldTypes.enum.boolean,
  group: "customFields",
}

const couponTopicConfig: FieldConfig = {
  name: "couponTopic:topic-1",
  topicId: "topic-1",
  formField: formFieldTypes.enum.text,
  group: "topicCoupon",
}

const roundTripCondition = (
  condition: ContactFilterCondition,
  config: FieldConfig | undefined,
) => buildConditionDraft(buildDraftFromCondition(condition), config)

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
    expect(
      buildConditionDraft(
        {
          field: "customField:cf-1",
          operator: operatorTypes.enum.gt,
          value: "10",
        },
        numberCustomFieldConfig,
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

  test("omits empty value for coupon topic used conditions", () => {
    expect(
      buildConditionDraft(
        {
          field: "couponTopic:topic-1",
          operator: operatorTypes.enum.used,
          value: "",
        },
        couponTopicConfig,
      ),
    ).toEqual({
      field: "couponTopic",
      topicId: "topic-1",
      operator: operatorTypes.enum.used,
    })
  })
})

describe("buildDraftFromCondition", () => {
  test("maps static text conditions to editable drafts", () => {
    expect(
      buildDraftFromCondition({
        field: "email",
        operator: operatorTypes.enum.eq,
        value: "a@b.com",
      }),
    ).toEqual({
      field: "email",
      operator: operatorTypes.enum.eq,
      value: "a@b.com",
    })
  })

  test("uses an empty draft value for static valueless operators", () => {
    expect(
      buildDraftFromCondition({
        field: "email",
        operator: operatorTypes.enum.isNotEmpty,
      }),
    ).toEqual({
      field: "email",
      operator: operatorTypes.enum.isNotEmpty,
      value: "",
    })
  })

  test("preserves static array values", () => {
    expect(
      buildDraftFromCondition({
        field: "tags",
        operator: operatorTypes.enum.in,
        value: ["t1", "t2"],
      }),
    ).toEqual({
      field: "tags",
      operator: operatorTypes.enum.in,
      value: ["t1", "t2"],
    })
  })

  test("maps custom fields to their encoded form field names", () => {
    expect(
      buildDraftFromCondition({
        field: "customField",
        customFieldId: "cf-1",
        customFieldType: "number",
        valueType: formFieldTypes.enum.number,
        operator: operatorTypes.enum.gt,
        value: "10",
      }),
    ).toEqual({
      field: "customField:cf-1",
      operator: operatorTypes.enum.gt,
      value: "10",
    })
  })

  test("uses an empty draft value for custom-field valueless operators", () => {
    expect(
      buildDraftFromCondition({
        field: "customField",
        customFieldId: "cf-1",
        customFieldType: "number",
        valueType: formFieldTypes.enum.number,
        operator: operatorTypes.enum.isEmpty,
      }),
    ).toEqual({
      field: "customField:cf-1",
      operator: operatorTypes.enum.isEmpty,
      value: "",
    })
  })

  test("preserves custom-field interval values", () => {
    expect(
      buildDraftFromCondition({
        field: "customField",
        customFieldId: "cf-1",
        customFieldType: "number",
        valueType: formFieldTypes.enum.number,
        operator: operatorTypes.enum.isBetween,
        value: ["1", "5"],
      }),
    ).toEqual({
      field: "customField:cf-1",
      operator: operatorTypes.enum.isBetween,
      value: ["1", "5"],
    })
  })
})

describe("round-trip editing", () => {
  test("keeps a static equality condition unchanged", () => {
    const condition: ContactFilterCondition = {
      field: "email",
      operator: operatorTypes.enum.eq,
      value: "a@b.com",
    }

    expect(roundTripCondition(condition, emailConfig)).toEqual(condition)
  })

  test("keeps a static valueless condition unchanged", () => {
    const condition: ContactFilterCondition = {
      field: "email",
      operator: operatorTypes.enum.isEmpty,
    }

    expect(roundTripCondition(condition, emailConfig)).toEqual(condition)
  })

  test("keeps a static array condition unchanged", () => {
    const condition: ContactFilterCondition = {
      field: "tags",
      operator: operatorTypes.enum.in,
      value: ["t1", "t2"],
    }

    expect(roundTripCondition(condition, tagConfig)).toEqual(condition)
  })

  test("keeps a custom number comparison unchanged", () => {
    const condition: ContactFilterCondition = {
      field: "customField",
      customFieldId: "cf-1",
      customFieldType: "number",
      valueType: formFieldTypes.enum.number,
      operator: operatorTypes.enum.gt,
      value: "10",
    }

    expect(roundTripCondition(condition, numberCustomFieldConfig)).toEqual(
      condition,
    )
  })

  test("keeps a custom interval condition unchanged", () => {
    const condition: ContactFilterCondition = {
      field: "customField",
      customFieldId: "cf-1",
      customFieldType: "number",
      valueType: formFieldTypes.enum.number,
      operator: operatorTypes.enum.isBetween,
      value: ["1", "5"],
    }

    expect(roundTripCondition(condition, numberCustomFieldConfig)).toEqual(
      condition,
    )
  })

  test("keeps a custom date equality condition unchanged", () => {
    const condition: ContactFilterCondition = {
      field: "customField",
      customFieldId: "cf-birthday",
      customFieldType: "date",
      valueType: formFieldTypes.enum.datetime,
      operator: operatorTypes.enum.eq,
      value: "2026-07-22",
    }

    expect(roundTripCondition(condition, dateCustomFieldConfig)).toEqual(
      condition,
    )
  })

  test("keeps a custom boolean condition unchanged", () => {
    const condition: ContactFilterCondition = {
      field: "customField",
      customFieldId: "cf-bool",
      customFieldType: "boolean",
      valueType: formFieldTypes.enum.boolean,
      operator: operatorTypes.enum.eq,
      value: "true",
    }

    expect(roundTripCondition(condition, booleanCustomFieldConfig)).toEqual(
      condition,
    )
  })
})

describe("getResetDraftForField", () => {
  test("uses the first enabled static operator and its default value", () => {
    expect(getResetDraftForField(emailConfig, conditionOptions)).toEqual({
      operator: operatorTypes.enum.eq,
      value: getDefaultStaticFieldValue(emailConfig, operatorTypes.enum.eq),
    })
  })

  test("skips disabled operators and returns the next enabled operator", () => {
    const textOptions = getConditionOptionsForConfig(
      emailConfig,
      conditionOptions,
    )

    expect(textOptions.find((option) => option.value === "in")?.disabled).toBe(
      true,
    )
    expect(
      textOptions.find((option) => option.value === "notIn")?.disabled,
    ).toBe(true)
    expect(getResetDraftForField(emailConfig, conditionOptions)).toEqual({
      operator: operatorTypes.enum.eq,
      value: "",
    })
  })

  test("uses an array draft value for set-style fields", () => {
    const resetDraft = getResetDraftForField(tagConfig, conditionOptions)

    expect(resetDraft).toEqual({
      operator: operatorTypes.enum.in,
      value: [],
    })
  })

  test("uses custom-field operator rules and defaults", () => {
    const resetDraft = getResetDraftForField(
      numberCustomFieldConfig,
      conditionOptions,
    )

    expect(resetDraft).toEqual({
      operator: operatorTypes.enum.eq,
      value: getDefaultCustomFieldValue(
        numberCustomFieldConfig,
        operatorTypes.enum.eq,
      ),
    })
  })

  test("returns an empty operator and value when no config is selected", () => {
    expect(getResetDraftForField(undefined, conditionOptions)).toEqual({
      operator: "",
      value: "",
    })
  })

  test("depends only on the new field config", () => {
    const emailReset = getResetDraftForField(emailConfig, conditionOptions)
    const genderReset = getResetDraftForField(genderConfig, conditionOptions)

    expect(getResetDraftForField(emailConfig, conditionOptions)).toEqual(
      emailReset,
    )
    expect(getResetDraftForField(genderConfig, conditionOptions)).toEqual(
      genderReset,
    )
  })
})

describe("getConditionOptionsForConfig", () => {
  test("routes static configs through static condition options", () => {
    expect(getConditionOptionsForConfig(emailConfig, conditionOptions)).toEqual(
      getStaticFieldConditionOptions(emailConfig, conditionOptions),
    )
  })

  test("routes custom-field configs through custom-field condition options", () => {
    expect(
      getConditionOptionsForConfig(numberCustomFieldConfig, conditionOptions),
    ).toEqual(
      getCustomFieldConditionOptions(numberCustomFieldConfig, conditionOptions),
    )
  })

  test("returns no operator options without a selected field", () => {
    expect(getConditionOptionsForConfig(undefined, conditionOptions)).toEqual(
      [],
    )
  })
})

describe("getDefaultConditionValue", () => {
  test("routes static default values through static field defaults", () => {
    expect(
      getDefaultConditionValue(emailConfig, operatorTypes.enum.eq),
    ).toEqual(getDefaultStaticFieldValue(emailConfig, operatorTypes.enum.eq))
  })

  test("returns an array default value for static set operators", () => {
    expect(getDefaultConditionValue(tagConfig, operatorTypes.enum.in)).toEqual(
      [],
    )
  })

  test("routes custom default values through custom-field defaults", () => {
    expect(
      getDefaultConditionValue(
        datetimeCustomFieldConfig,
        operatorTypes.enum.isBetween,
      ),
    ).toEqual(
      getDefaultCustomFieldValue(
        datetimeCustomFieldConfig,
        operatorTypes.enum.isBetween,
      ),
    )
  })
})
