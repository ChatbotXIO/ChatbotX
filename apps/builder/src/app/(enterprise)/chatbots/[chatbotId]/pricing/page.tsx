"use client"

import { PricingTableFour } from "@aha.chat/ui/components/billingsdk/pricing-table-four"
import { samplePlans } from "@aha.chat/ui/lib/billingsdk-config"

export default function PricingTableFourDemo() {
  // authClient.subscription.upgrade({
  //   customerType: "chatbot",
  // })
  return (
    <PricingTableFour
      billingToggleLabels={{
        monthly: "Monthly",
        yearly: "Yearly",
      }}
      className="w-full"
      description="Transform your project with our comprehensive pricing options designed for every need."
      onPlanSelect={(planId: string) => console.log("Selected plan:", planId)}
      plans={samplePlans}
      showBillingToggle={false}
      size="medium"
      subtitle="Simple Pricing"
      theme="classic"
      title="Choose Your Perfect Plan"
    />
  )
}
