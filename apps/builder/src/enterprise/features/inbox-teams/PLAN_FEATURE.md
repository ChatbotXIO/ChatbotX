# Inbox Team Plans

This feature allows organizations to create and manage pricing plans for inbox teams, with automatic Stripe integration for billing.

## Overview

The inbox team plan feature provides:

- **Plan Management**: Create, update, and delete pricing plans for inbox teams
- **Stripe Integration**: Automatically creates and manages Stripe products and prices
- **Subscriptions**: Teams can subscribe to plans with automatic billing
- **Trial Periods**: Support for free trial periods on plans
- **Flexible Limits**: Define custom limits and features for each plan

## Components

### Database Models

- **InboxTeamPlan**: Defines a pricing plan with Stripe price IDs and feature limits
- **InboxTeamPlanSubscription**: Tracks which teams are subscribed to which plans

### Actions

#### createInboxTeamPlanAction
Creates a new pricing plan for an organization.

```typescript
await createInboxTeamPlanAction({
  name: "Pro Plan",
  description: "Advanced features for teams",
  maxTeamMembers: 10,
  monthlyPrice: 99,
  annualPrice: 999,
  limits: {
    messageLimit: 10000,
    automationRules: 50,
  },
  freeTrial: { days: 14 }
})
```

#### updateInboxTeamPlanAction
Updates an existing plan's details.

```typescript
await updateInboxTeamPlanAction({
  planId: "plan123",
  name: "Pro Plan (Updated)",
  maxTeamMembers: 15,
  limits: { messageLimit: 20000 }
})
```

#### deleteInboxTeamPlanAction
Deletes one or more plans (archives them in Stripe).

```typescript
await deleteInboxTeamPlanAction({
  ids: ["plan123", "plan456"]
})
```

#### subscribeToInboxTeamPlanAction
Subscribes an inbox team to a plan.

```typescript
await subscribeToInboxTeamPlanAction({
  inboxTeamId: "team123",
  planId: "plan123",
  billingInterval: "monthly" // or "annual"
})
```

### Queries

#### listInboxTeamPlansByOrganization
Fetches all plans for an organization.

```typescript
const plans = await listInboxTeamPlansByOrganization(organizationId)
```

#### getInboxTeamPlanById
Fetches a specific plan by ID.

```typescript
const plan = await getInboxTeamPlanById(planId, organizationId)
```

## Stripe Integration

The feature includes a Stripe service (`stripeInboxTeamPlanService`) that handles:

- Creating Stripe products and prices
- Creating subscriptions with optional trial periods
- Updating subscription billing intervals
- Canceling subscriptions
- Archiving products when plans are deleted

### Price Management

- Monthly and annual prices are both supported
- Prices are stored in database with Stripe price IDs
- Automatic handling of currency conversion (prices in cents)

## Database Schema

### InboxTeamPlan
```
id: text (CUID2)
name: text ✓
description: text
priceId: text ✓ (monthly Stripe price)
annualPriceId: text? (annual Stripe price)
maxTeamMembers: integer (default: 1)
limits: jsonb (custom limits object)
freeTrial: jsonb? { days: number }
organizationId: text ✓ (FK)
createdAt: timestamp ✓
updatedAt: timestamp ✓
```

### InboxTeamPlanSubscription
```
id: text (CUID2)
inboxTeamId: text ✓ (FK)
planId: text ✓ (FK)
stripeSubscriptionId: text?
stripeCustomerId: text?
status: text (active, canceled, etc.)
currentPeriodStart/End: timestamp
billingInterval: text (monthly|annual)
isMonthly: boolean
trialStart/End: timestamp
cancelAtPeriodEnd: boolean
canceledAt/endedAt: timestamp
createdAt/updatedAt: timestamp
```

## Usage Example

```typescript
import {
  createInboxTeamPlanAction,
  subscribeToInboxTeamPlanAction,
} from "@/enterprise/features/inbox-teams"

// 1. Create a plan in the admin panel
const planResult = await createInboxTeamPlanAction(chatbotId, {
  name: "Team Plan",
  maxTeamMembers: 5,
  monthlyPrice: 49,
})

// 2. User subscribes team to the plan
const subscriptionResult = await subscribeToInboxTeamPlanAction(chatbotId, {
  inboxTeamId: teamId,
  planId: planResult.planId,
  billingInterval: "monthly"
})

// 3. Stripe handles the actual payment

// 4. Use plan limits in your application
const plan = await getInboxTeamPlanById(planId, organizationId)
enforceLimit("messageLimit", plan.limits.messageLimit)
```

## Notes

- Organization requires a `billingCustomerId` (Stripe customer ID) to subscribe to plans
- Plans can only be updated or deleted by the organization that owns them
- Stripe products are archived (not deleted) to preserve billing history
- Trial periods are optional and defined in the plan
