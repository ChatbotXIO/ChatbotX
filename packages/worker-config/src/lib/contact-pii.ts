const contactPIIExportFields = new Set(["sys:email", "sys:phoneNumber"])

export function stripContactPIIFields(
  fields: string[],
  canViewPII: boolean,
): string[] {
  if (canViewPII) {
    return [...fields]
  }

  return fields.filter((field) => !contactPIIExportFields.has(field))
}
