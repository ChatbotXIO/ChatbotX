import { db } from "@chatbotx.io/database/client"
import type {
  ContactInboxModel,
  ContactModel,
} from "@chatbotx.io/database/types"
import type {
  IncomingContact,
  SourceScopedIdentityMatchedBy,
} from "@chatbotx.io/sdk"
import { contactService } from "../contact/service"
import {
  resolveParentFallbackRotationPlan,
  shouldAdvanceFromParentMatch,
} from "./identity-rotation"
import { contactInboxService } from "./service"

class PhoneAdoptionRejected extends Error {}

export const syncExistingContactIdentity = async (props: {
  workspaceId: string
  contact: ContactModel
  contactInbox: ContactInboxModel
  incomingContact: IncomingContact
  matchedBy: SourceScopedIdentityMatchedBy
}): Promise<{
  contactInbox: ContactInboxModel
  contact: ContactModel
  learnedPrimaryIdentity?: { value: string }
}> => {
  const shouldAdvance = shouldAdvanceFromParentMatch({
    row: props.contactInbox,
    incomingContact: props.incomingContact,
    matchedBy: props.matchedBy,
  })
  const incomingSourceUserId = props.incomingContact.sourceUserId
  const plan =
    shouldAdvance && incomingSourceUserId
      ? resolveParentFallbackRotationPlan(props.contactInbox, {
          ...props.incomingContact,
          sourceUserId: incomingSourceUserId,
        })
      : undefined

  if (!plan?.reportPhoneTransition) {
    const sync = await contactInboxService.syncScopedIdentity({
      contactInbox: props.contactInbox,
      incomingContact: props.incomingContact,
      matchedBy: props.matchedBy,
    })
    return {
      contactInbox: sync.contactInbox,
      contact: props.contact,
      learnedPrimaryIdentity: sync.learnedPrimaryIdentity,
    }
  }

  try {
    const committed = await db.transaction(async (tx) => {
      const sync = await contactInboxService.syncScopedIdentity({
        tx,
        contactInbox: props.contactInbox,
        incomingContact: props.incomingContact,
        matchedBy: props.matchedBy,
      })
      if (!sync.phoneTransition) {
        return { sync }
      }
      const adoption = await contactService.adoptPhoneNumberIfSafeInTransaction(
        {
          workspaceId: props.workspaceId,
          id: props.contact.id,
          previousPhone: sync.phoneTransition.previousPhone,
          newPhone: sync.phoneTransition.newPhone,
        },
        tx,
      )
      if (!adoption) {
        throw new PhoneAdoptionRejected()
      }
      return { adoption, sync }
    })

    if (committed.sync.invalidation) {
      await contactInboxService.invalidateTracking(committed.sync.invalidation)
    }
    if (committed.adoption) {
      await contactService.finalizePhoneNumberAdoption({
        workspaceId: props.workspaceId,
        id: props.contact.id,
        ...committed.adoption,
      })
    }
    return {
      contactInbox: committed.sync.contactInbox,
      contact: committed.adoption?.updated ?? props.contact,
      learnedPrimaryIdentity: committed.sync.learnedPrimaryIdentity,
    }
  } catch (error) {
    if (error instanceof PhoneAdoptionRejected) {
      return {
        contactInbox: props.contactInbox,
        contact: props.contact,
      }
    }
    throw error
  }
}
