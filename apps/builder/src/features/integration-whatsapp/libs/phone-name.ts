const PHONE_NAME_SUFFIX_LENGTH = 3

export function buildWhatsappPhoneName(props: {
  verifiedName: string
  displayPhoneNumber: string
  hasWorkspaceDuplicateName: boolean
}) {
  const name = props.verifiedName.trim() || props.displayPhoneNumber
  if (!props.hasWorkspaceDuplicateName) {
    return name
  }

  const suffix = props.displayPhoneNumber.slice(-PHONE_NAME_SUFFIX_LENGTH)

  return suffix ? `${name} - ${suffix}` : name
}
