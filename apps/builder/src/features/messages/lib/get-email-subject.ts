/** Subject of an email message (`contentAttributes.email.subject`), if it has one. */
export const getEmailSubject = (
  contentAttributes: unknown,
): string | undefined => {
  if (typeof contentAttributes !== "object" || contentAttributes === null) {
    return
  }
  const email = (contentAttributes as { email?: unknown }).email
  if (typeof email !== "object" || email === null) {
    return
  }
  const subject = (email as { subject?: unknown }).subject
  return typeof subject === "string" && subject.trim() !== ""
    ? subject.trim()
    : undefined
}
