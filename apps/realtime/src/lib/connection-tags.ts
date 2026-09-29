const USER_TAG_PREFIX = "user:"

/**
 * PartyKit connection tag identifying every socket a given workspace member
 * currently holds open in a `workspaces` room. Used both to tag a connection
 * on connect (`Party.Server#getConnectionTags`) and to look it back up for
 * targeted send / revocation (`room.getConnections(tag)`).
 */
export const toUserConnectionTag = (userId: string): string =>
  `${USER_TAG_PREFIX}${userId}`
