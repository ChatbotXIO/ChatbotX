import type {
  ContactInboxIdentityFields,
  ContactInboxIdentityGuard,
} from "@chatbotx.io/database/repositories"
import type {
  ContactInboxModel,
  ContactInboxOperationalModel,
  ContactModel,
} from "@chatbotx.io/database/types"
import {
  type IncomingContact,
  isDistinctPrimaryIdentity,
  isSourceUserIdKeyedIdentity,
} from "@chatbotx.io/sdk"

export type ContactInboxWithContact = ContactInboxModel & {
  contact: ContactModel
}

export type ContactInboxIdentityField = keyof ContactInboxIdentityFields

export type ContactInboxIdentitySet = Partial<ContactInboxIdentityFields>

export const shouldAppendContactInboxIdentityHistory = (props: {
  row: ContactInboxOperationalModel
  set: ContactInboxIdentitySet
}): boolean =>
  (["sourceId", "sourceUserId", "sourceParentUserId"] as const).some(
    (field) => {
      const previousValue = props.row[field]
      const nextValue = props.set[field]
      return (
        Boolean(previousValue) &&
        nextValue !== undefined &&
        nextValue !== previousValue
      )
    },
  )

export type ContactInboxIdentityMatch = {
  field: ContactInboxIdentityField
  row: ContactInboxWithContact
  value: string
}

export type ContactInboxPhoneTransition = {
  previousPhone?: string
  newPhone: string
}

export const resolvePhoneTransition = (props: {
  previousPhone?: string
  newPhone?: string
  scopedUserIds: Array<string | null | undefined>
}): ContactInboxPhoneTransition | undefined => {
  const newPhone = props.newPhone
  if (
    !(
      newPhone && isDistinctPrimaryIdentity(newPhone, ...props.scopedUserIds)
    ) ||
    newPhone === props.previousPhone
  ) {
    return
  }
  return { previousPhone: props.previousPhone, newPhone }
}

export type RotationChange = {
  previousUserId?: string
  userId: string
  previousParentUserId?: string
  parentUserId?: string
  previousPhone?: string
  newPhone?: string
}

export type RotationPlan =
  | {
      outcome: "apply"
      guard: ContactInboxIdentityGuard
      set: ContactInboxIdentitySet
      reportPhoneTransition?: ContactInboxPhoneTransition
    }
  | {
      outcome: "alreadyApplied"
      reportPhoneTransition?: ContactInboxPhoneTransition
    }
  | { outcome: "stale" }

export type PhoneChangeInput = {
  previousPhone: string
  newPhone: string
  userId?: string
}

export type PhoneChangeMatch = ContactInboxIdentityMatch & {
  kind: "current" | "previous"
}

export type PhoneChangePlan =
  | { outcome: "invalid" }
  | { outcome: "stale" }
  | {
      outcome: "applied" | "alreadyApplied"
      phoneTransition: ContactInboxPhoneTransition
    }
  | {
      outcome: "write"
      guard: ContactInboxIdentityGuard
      set: ContactInboxIdentitySet
      phoneTransition: ContactInboxPhoneTransition
    }

export type ScopedIdentityBackfillPlan = {
  pendingFields: ContactInboxBackfillField[]
  sourceUsername?: string
}

export type ContactInboxBackfillField = "sourceUserId" | "sourceParentUserId"

export const hasDistinctPrimaryIdentity = (
  incomingContact: IncomingContact,
): boolean =>
  isDistinctPrimaryIdentity(
    incomingContact.sourceId,
    incomingContact.sourceUserId,
  )

export const resolveLearnedPrimaryIdentity = (
  contactInbox: ContactInboxOperationalModel,
  incomingContact: IncomingContact,
): { value: string } | undefined => {
  if (
    !(
      isSourceUserIdKeyedIdentity(contactInbox) &&
      hasDistinctPrimaryIdentity(incomingContact)
    ) ||
    incomingContact.sourceId === contactInbox.sourceId
  ) {
    return
  }
  return { value: incomingContact.sourceId }
}

export const shouldAdvanceFromParentMatch = (props: {
  row: ContactInboxOperationalModel
  incomingContact: IncomingContact
  matchedBy: string
}): props is typeof props & {
  incomingContact: IncomingContact & { sourceUserId: string }
} =>
  props.matchedBy === "sourceParentUserId" &&
  Boolean(props.incomingContact.sourceUserId) &&
  props.incomingContact.sourceUserId !== props.row.sourceUserId &&
  Boolean(props.row.sourceParentUserId)

export const resolveScopedIdentityBackfillPlan = (props: {
  row: ContactInboxOperationalModel
  incomingContact: IncomingContact
  skipSourceUserId: boolean
}): ScopedIdentityBackfillPlan => ({
  pendingFields: [
    ...(!props.skipSourceUserId &&
    props.incomingContact.sourceUserId &&
    !props.row.sourceUserId
      ? (["sourceUserId"] as const)
      : []),
    ...(props.incomingContact.sourceParentUserId &&
    !props.row.sourceParentUserId
      ? (["sourceParentUserId"] as const)
      : []),
  ],
  sourceUsername:
    props.incomingContact.sourceUsername &&
    props.incomingContact.sourceUsername !== props.row.sourceUsername
      ? props.incomingContact.sourceUsername
      : undefined,
})

export const resolveRotationSet = (
  row: ContactInboxOperationalModel,
  target: ContactInboxIdentitySet,
): ContactInboxIdentitySet => ({
  ...(target.sourceId === undefined || target.sourceId === row.sourceId
    ? {}
    : { sourceId: target.sourceId }),
  ...(target.sourceUserId === undefined ||
  target.sourceUserId === row.sourceUserId
    ? {}
    : { sourceUserId: target.sourceUserId }),
  ...(target.sourceParentUserId === undefined ||
  target.sourceParentUserId === row.sourceParentUserId
    ? {}
    : { sourceParentUserId: target.sourceParentUserId }),
})

const isRotationScopedIdKeyed = (
  row: ContactInboxOperationalModel,
  change: RotationChange,
): boolean =>
  row.sourceId === "" ||
  isSourceUserIdKeyedIdentity(row) ||
  row.sourceId === change.previousUserId ||
  row.sourceId === change.userId

const isPreviousKeyMatchWithoutPreviousUserId = (props: {
  matchKind: "current" | "previous"
  matchedBy: ContactInboxIdentityField
  matchedValue: string
  change: RotationChange
}): boolean =>
  props.matchKind === "previous" &&
  !props.change.previousUserId &&
  ((props.matchedBy === "sourceId" &&
    props.matchedValue === props.change.previousPhone) ||
    (props.matchedBy === "sourceParentUserId" &&
      props.matchedValue === props.change.previousParentUserId))

const resolveRotationTarget = (
  change: RotationChange,
): ContactInboxIdentitySet => ({
  sourceId: change.userId,
  sourceUserId: change.userId,
  sourceParentUserId: change.parentUserId,
})

const resolveRotationGuard = (
  row: ContactInboxOperationalModel,
  match: Pick<PhoneChangeMatch, "field" | "value">,
  set: ContactInboxIdentitySet,
): ContactInboxIdentityGuard => {
  let guard: ContactInboxIdentityGuard
  if (match.field === "sourceId") {
    guard = { sourceId: match.value }
  } else if (match.field === "sourceUserId") {
    guard = { sourceUserId: match.value }
  } else {
    guard = { sourceParentUserId: match.value }
  }
  if (set.sourceId !== undefined) {
    guard.sourceId = row.sourceId
  }
  if (set.sourceUserId !== undefined) {
    guard.sourceUserId = row.sourceUserId
  }
  // A known parent must participate in CAS. A null parent is intentionally
  // unguarded so a concurrent null -> current-parent backfill cannot stale a rotation.
  if (set.sourceParentUserId !== undefined && row.sourceParentUserId !== null) {
    guard.sourceParentUserId = row.sourceParentUserId
  }
  return guard
}

type IdentityTargetStatePlanProps = {
  row: ContactInboxOperationalModel
  observedMatch: Pick<PhoneChangeMatch, "field" | "value">
  targetIdentity: ContactInboxIdentitySet
  phoneObservation: {
    previousPhone?: string
    newPhone?: string
    scopedUserIds: Array<string | null | undefined>
    useNewPhoneAsSourceId: boolean
  }
}

const resolveIdentityTargetStatePlan = (
  props: IdentityTargetStatePlanProps,
): Exclude<RotationPlan, { outcome: "stale" }> => {
  const reportPhoneTransition = resolvePhoneTransition(props.phoneObservation)
  const targetIdentity =
    reportPhoneTransition && props.phoneObservation.useNewPhoneAsSourceId
      ? { ...props.targetIdentity, sourceId: reportPhoneTransition.newPhone }
      : props.targetIdentity
  const set = resolveRotationSet(props.row, targetIdentity)
  if (Object.keys(set).length === 0) {
    return {
      outcome: "alreadyApplied",
      ...(reportPhoneTransition ? { reportPhoneTransition } : {}),
    }
  }
  return {
    outcome: "apply",
    guard: resolveRotationGuard(props.row, props.observedMatch, set),
    set,
    ...(reportPhoneTransition ? { reportPhoneTransition } : {}),
  }
}

/** Builds the D6 target state from a parent-fallback observation. */
export const resolveParentFallbackRotationPlan = (
  row: ContactInboxOperationalModel,
  incomingContact: IncomingContact & { sourceUserId: string },
): Exclude<RotationPlan, { outcome: "stale" }> => {
  const scopedIdKeyed = !row.sourceId || isSourceUserIdKeyedIdentity(row)
  return resolveIdentityTargetStatePlan({
    row,
    observedMatch: {
      field: "sourceParentUserId",
      value: row.sourceParentUserId ?? "",
    },
    targetIdentity: {
      sourceId: scopedIdKeyed
        ? incomingContact.sourceUserId
        : incomingContact.sourceId || undefined,
      sourceUserId: incomingContact.sourceUserId,
    },
    phoneObservation: {
      previousPhone: scopedIdKeyed ? undefined : row.sourceId,
      newPhone: incomingContact.sourceId,
      scopedUserIds: [incomingContact.sourceUserId, row.sourceUserId],
      useNewPhoneAsSourceId: false,
    },
  })
}

/** Plans a user-id rotation from the observed row to its complete target state. */
export const resolveRotationPlan = (props: {
  row: ContactInboxWithContact
  matchKind: "current" | "previous"
  matchedBy: ContactInboxIdentityField
  matchedValue: string
  change: RotationChange
}): RotationPlan => {
  const { change, row } = props
  const hasUnrelatedSourceUserId =
    row.sourceUserId !== null &&
    row.sourceUserId !== change.userId &&
    row.sourceUserId !== change.previousUserId
  if (
    hasUnrelatedSourceUserId &&
    !isPreviousKeyMatchWithoutPreviousUserId(props)
  ) {
    return { outcome: "stale" }
  }

  return resolveIdentityTargetStatePlan({
    row,
    observedMatch: { field: props.matchedBy, value: props.matchedValue },
    targetIdentity: resolveRotationTarget(change),
    phoneObservation: {
      previousPhone: change.previousPhone,
      newPhone: change.newPhone,
      scopedUserIds: [change.userId, change.previousUserId, row.sourceUserId],
      useNewPhoneAsSourceId: !isRotationScopedIdKeyed(row, change),
    },
  })
}

export const normalizeRotationChange = (
  props: RotationChange,
): RotationChange => {
  const previousUserId = props.previousUserId?.trim() || undefined
  const userId = props.userId.trim()
  const previousPhone = props.previousPhone?.trim() || undefined
  return {
    previousUserId,
    userId,
    previousParentUserId: props.previousParentUserId?.trim() || undefined,
    parentUserId: props.parentUserId?.trim() || undefined,
    previousPhone,
    newPhone: resolvePhoneTransition({
      previousPhone,
      newPhone: props.newPhone?.trim() || undefined,
      scopedUserIds: [userId, previousUserId],
    })?.newPhone,
  }
}

export const isValidRotationChange = (change: RotationChange): boolean =>
  Boolean(
    change.userId &&
      (change.previousUserId ||
        change.previousParentUserId ||
        change.previousPhone) &&
      (change.previousUserId !== change.userId || change.newPhone),
  )

export const normalizePhoneChangeInput = (
  props: PhoneChangeInput,
): PhoneChangeInput => ({
  previousPhone: props.previousPhone.trim(),
  newPhone: props.newPhone.trim(),
  userId: props.userId?.trim() || undefined,
})

export const isValidPhoneChangeInput = (input: PhoneChangeInput): boolean =>
  Boolean(
    input.previousPhone &&
      input.newPhone !== input.previousPhone &&
      isDistinctPrimaryIdentity(input.newPhone, input.userId),
  )

/** Plans a phone change after production lookup identifies the matched row. */
export const resolvePhoneChangePlan = (
  match: PhoneChangeMatch,
  input: PhoneChangeInput,
): PhoneChangePlan => {
  const { row } = match
  if (
    input.userId &&
    row.sourceUserId !== null &&
    row.sourceUserId !== input.userId
  ) {
    return { outcome: "stale" }
  }
  const phoneTransition = resolvePhoneTransition({
    previousPhone: input.previousPhone,
    newPhone: input.newPhone,
    scopedUserIds: [input.userId, row.sourceUserId],
  })
  if (!phoneTransition) {
    return { outcome: "invalid" }
  }
  if (match.kind === "current" || row.sourceId === input.newPhone) {
    return { outcome: "alreadyApplied", phoneTransition }
  }
  if (match.field === "sourceUserId") {
    return !row.sourceId || isSourceUserIdKeyedIdentity(row)
      ? { outcome: "applied", phoneTransition }
      : { outcome: "stale" }
  }
  return {
    outcome: "write",
    guard: {
      sourceId: input.previousPhone,
      ...(input.userId === undefined ? {} : { sourceUserId: row.sourceUserId }),
    },
    set: { sourceId: input.newPhone },
    phoneTransition,
  }
}
