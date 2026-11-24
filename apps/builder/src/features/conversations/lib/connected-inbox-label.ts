type ConnectedInboxLabelSource = {
  name: string
  integrationWhatsapp?: { displayPhoneNumber?: string | null } | null
  integrationInstagram?: { username?: string | null } | null
}

// Inbox.name is what the thread row already shows. Phone and Instagram
// username are appended when the name alone would collide across accounts.
export const connectedInboxLabel = (inbox: ConnectedInboxLabelSource) => {
  const name = inbox.name.trim()
  const phone = inbox.integrationWhatsapp?.displayPhoneNumber?.trim()
  if (phone && !name.includes(phone)) {
    return `${name} · ${phone}`
  }
  const username = inbox.integrationInstagram?.username?.trim()
  if (username && !name.toLowerCase().includes(username.toLowerCase())) {
    return `${name} · @${username.replace(/^@/, "")}`
  }
  return name
}
