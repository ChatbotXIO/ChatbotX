export interface Conversation {
  id: string;
  contactId: string;
  channelType: string;
  lastActivityAt: string;
  contactLastSeenAt: string;
  lastMessage: string;
  assignedType: string | null;
  assignedId: string | null;
  contact: Contact;
  assignedTeam?: Assigned;
  assignedUser?: Assigned;
}

export interface Assigned {
  id: string;
  name: string;
}

export interface Contact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: null | string;
  avatar: string | null;
}
