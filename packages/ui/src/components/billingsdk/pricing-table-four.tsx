"use client"

import { Badge } from "@aha.chat/ui/components/ui/badge"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Label } from "@aha.chat/ui/components/ui/label"
import {
  RadioGroup,
  RadioGroupItem,
} from "@aha.chat/ui/components/ui/radio-group"
import type { Plan } from "@aha.chat/ui/lib/billingsdk-config"
import { cn } from "@aha.chat/ui/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"
import { Award, Building2, Check, Package } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useId, useState } from "react"

const sectionVariants = cva("relative overflow-hidden py-32", {
  variants: {
    size: {
      small: "py-12",
      medium: "py-20",
      large: "py-32",
    },
    theme: {
      minimal: "bg-background",
      classic: "bg-gradient-to-b from-background to-muted/20",
    },
  },
  defaultVariants: {
    size: "medium",
    theme: "minimal",
  },
})

const titleVariants = cva("mb-4 font-bold text-foreground", {
  variants: {
    size: {
      small: "text-3xl lg:text-4xl",
      medium: "text-4xl lg:text-5xl",
      large: "text-4xl lg:text-6xl",
    },
    theme: {
      minimal: "",
      classic:
        "bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text pb-1 text-transparent",
    },
  },
  defaultVariants: {
    size: "medium",
    theme: "minimal",
  },
})

const descriptionVariants = cva(
  "mx-auto mb-2 max-w-3xl text-muted-foreground",
  {
    variants: {
      size: {
        small: "text-base lg:text-lg",
        medium: "text-lg lg:text-xl",
        large: "lg:text-xl",
      },
      theme: {
        minimal: "",
        classic: "",
      },
    },
    defaultVariants: {
      size: "medium",
      theme: "minimal",
    },
  },
)

const cardVariants = cva(
  "relative h-full rounded-lg border bg-card text-card-foreground transition-all duration-300",
  {
    variants: {
      size: {
        small: "p-4",
        medium: "p-5",
        large: "p-6",
      },
      theme: {
        minimal: "hover:bg-muted/30",
        classic: "border-border/50 bg-card/50 backdrop-blur-sm hover:shadow-xl",
      },
      highlight: {
        true: "",
        false: "",
      },
    },
    compoundVariants: [
      {
        theme: "classic",
        highlight: true,
        className:
          "relative overflow-hidden border-primary/30 bg-gradient-to-b from-primary/5 to-transparent shadow-xl ring-2 ring-primary/20",
      },
      {
        theme: "minimal",
        highlight: true,
        className: "border-primary/20 bg-muted/50",
      },
    ],
    defaultVariants: {
      size: "large",
      theme: "minimal",
      highlight: false,
    },
  },
)

const toggleVariants = cva(
  "flex h-11 w-fit shrink-0 items-center rounded-md p-1 text-lg",
  {
    variants: {
      theme: {
        minimal: "bg-muted",
        classic:
          "border border-border/50 bg-muted/50 shadow-lg backdrop-blur-sm",
      },
    },
    defaultVariants: {
      theme: "minimal",
    },
  },
)

const priceTextVariants = cva("font-medium", {
  variants: {
    size: {
      small: "text-2xl",
      medium: "text-3xl",
      large: "text-4xl",
    },
    theme: {
      minimal: "",
      classic:
        "bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text font-extrabold text-transparent",
    },
  },
  defaultVariants: {
    size: "large",
    theme: "minimal",
  },
})

const buttonVariants = cva(
  "w-full transition-all duration-300 hover:cursor-pointer",
  {
    variants: {
      theme: {
        minimal:
          "group relative isolate inline-flex h-9 w-full items-center justify-center overflow-hidden rounded-md bg-primary px-3 py-2 text-left font-medium text-primary-foreground text-sm shadow ring-1 ring-primary before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-md before:bg-gradient-to-b before:from-primary-foreground/20 before:opacity-80 before:transition-opacity before:duration-300 before:ease-[cubic-bezier(0.4,0.36,0,1)] after:pointer-events-none after:absolute after:inset-0 after:-z-10 after:rounded-md after:bg-gradient-to-b after:from-primary-foreground/10 after:to-transparent after:mix-blend-overlay hover:bg-primary/90",
        classic:
          "relative overflow-hidden rounded-lg border border-primary/20 bg-gradient-to-r from-primary to-primary/80 px-6 py-3 font-semibold text-primary-foreground hover:shadow-xl active:scale-95",
      },
    },
    defaultVariants: {
      theme: "minimal",
    },
  },
)

const featureIconVariants = cva("h-[1lh] flex-none", {
  variants: {
    size: {
      small: "size-3",
      medium: "size-4",
      large: "size-4",
    },
    theme: {
      minimal: "text-primary",
      classic: "text-emerald-500",
    },
  },
  defaultVariants: {
    size: "large",
    theme: "minimal",
  },
})

export interface PricingTableFourProps
  extends VariantProps<typeof sectionVariants> {
  billingToggleLabels?: {
    monthly: string
    yearly: string
  }
  className?: string
  description?: string
  onPlanSelect?: (planId: string) => void
  plans: Plan[]
  showBillingToggle?: boolean
  subtitle?: string
  title?: string
}

const defaultIcons = {
  starter: <Package className="h-4 w-4" />,
  pro: <Award className="h-4 w-4" />,
  enterprise: <Building2 className="h-4 w-4" />,
}

export function PricingTableFour({
  plans,
  title = "Choose Your Perfect Plan",
  description = "Transform your project with our comprehensive pricing options designed for every need.",
  subtitle,
  onPlanSelect,
  className,
  size = "medium",
  theme = "minimal",
  showBillingToggle = true,
  billingToggleLabels = {
    monthly: "Monthly",
    yearly: "Yearly",
  },
}: PricingTableFourProps) {
  const [isAnnually, setIsAnnually] = useState(false)
  const uniqueId = useId()

  function calculateDiscount(
    monthlyPrice: string,
    yearlyPrice: string,
  ): number {
    const monthly = Number.parseFloat(monthlyPrice)
    const yearly = Number.parseFloat(yearlyPrice)

    if (
      monthlyPrice.toLowerCase() === "custom" ||
      yearlyPrice.toLowerCase() === "custom" ||
      Number.isNaN(monthly) ||
      Number.isNaN(yearly) ||
      monthly === 0
    ) {
      return 0
    }

    const discount = ((monthly * 12 - yearly) / (monthly * 12)) * 100
    return Math.round(discount)
  }

  const yearlyPriceDiscount = plans.length
    ? Math.max(
        ...plans.map((plan) =>
          calculateDiscount(plan.monthlyPrice, plan.yearlyPrice),
        ),
      )
    : 0

  const handlePlanSelect = (planId: string) => {
    onPlanSelect?.(planId)
  }

  const getPlanIcon = (planId: string) => {
    return (
      defaultIcons[planId as keyof typeof defaultIcons] || (
        <Package className="h-5 w-5" />
      )
    )
  }

  return (
    <section className={cn(sectionVariants({ size, theme }), className)}>
      {/* Classic theme background elements */}
      {theme === "classic" && (
        <>
          <div className="absolute inset-0 bg-grid-pattern opacity-5" />
          <div className="absolute top-1/2 left-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute top-1/4 right-1/4 h-64 w-64 rounded-full bg-secondary/5 blur-2xl" />
        </>
      )}

      <div className="container relative mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-12 text-center">
          {subtitle && (
            <p className="mb-3 font-medium text-primary text-sm uppercase tracking-wide">
              {subtitle}
            </p>
          )}
          <h2 className={cn(titleVariants({ size, theme }))}>{title}</h2>
          <p className={cn(descriptionVariants({ size, theme }))}>
            {description}
          </p>

          {showBillingToggle && (
            <div
              className={cn(
                "mx-auto mt-8 flex justify-center",
                toggleVariants({ theme }),
              )}
            >
              <RadioGroup
                className="h-full grid-cols-2"
                defaultValue="monthly"
                onValueChange={(value) => {
                  setIsAnnually(value === "annually")
                }}
              >
                <div className='h-full rounded-md transition-all has-[button[data-state="checked"]]:bg-background'>
                  <RadioGroupItem
                    className="peer sr-only"
                    id={`${uniqueId}-monthly`}
                    value="monthly"
                  />
                  <Label
                    className="flex h-full cursor-pointer items-center justify-center px-2 font-semibold text-muted-foreground transition-all hover:text-foreground peer-data-[state=checked]:text-primary md:px-7"
                    htmlFor={`${uniqueId}-monthly`}
                  >
                    {billingToggleLabels.monthly}
                  </Label>
                </div>
                <div className='h-full rounded-md transition-all has-[button[data-state="checked"]]:bg-background'>
                  <RadioGroupItem
                    className="peer sr-only"
                    id={`${uniqueId}-annually`}
                    value="annually"
                  />
                  <Label
                    className="flex h-full cursor-pointer items-center justify-center gap-1 px-2 font-semibold text-muted-foreground transition-all hover:text-foreground peer-data-[state=checked]:text-primary md:px-7"
                    htmlFor={`${uniqueId}-annually`}
                  >
                    {billingToggleLabels.yearly}
                    {yearlyPriceDiscount > 0 && (
                      <span className="ml-1 rounded border border-primary/20 bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs">
                        Save {yearlyPriceDiscount}%
                      </span>
                    )}
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}
        </div>

        <div
          className={cn(
            "grid gap-6",
            plans.length === 1 && "mx-auto max-w-md grid-cols-1",
            plans.length === 2 &&
              "mx-auto max-w-4xl grid-cols-1 md:grid-cols-2",
            plans.length === 3 && "grid-cols-1 md:grid-cols-3",
            plans.length >= 4 &&
              "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
          )}
        >
          {plans.map((plan, index) => (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="group relative h-full"
              initial={{ opacity: 0, y: 20 }}
              key={plan.id}
              transition={{
                duration: 0.4,
                delay: index * 0.1,
                ease: "easeOut",
              }}
            >
              {/* Popular badge */}
              {plan.badge && (
                <Badge
                  className={cn(
                    "absolute -top-3 left-1/2 z-20 -translate-x-1/2 transform",
                    theme === "classic"
                      ? "border-primary/20 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg"
                      : "bg-primary text-primary-foreground",
                  )}
                >
                  {plan.badge}
                </Badge>
              )}

              {/* Classic theme highlight effect */}
              {theme === "classic" && plan.highlight && (
                <div className="absolute -top-px left-1/2 h-px w-32 -translate-x-1/2 bg-gradient-to-r from-transparent via-primary to-transparent" />
              )}

              <div
                className={cn(
                  cardVariants({ size, theme, highlight: plan.highlight }),
                )}
              >
                <div className="flex h-full flex-col">
                  {/* Icon and Title */}
                  <div className="mb-4 flex items-start gap-4">
                    <div className="flex-1">
                      <h3
                        className={cn(
                          "mb-1 font-bold text-xl",
                          theme === "classic" ? "text-lg" : "",
                        )}
                      >
                        {plan.title}
                      </h3>
                      <p
                        className={cn(
                          "text-muted-foreground text-sm",
                          theme === "classic" && "text-foreground/80",
                        )}
                      >
                        {plan.description}
                      </p>
                    </div>
                    <div
                      className={cn(
                        "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg",
                        theme === "classic"
                          ? "border border-primary/20 bg-primary/10 text-primary"
                          : "border border-border bg-muted text-foreground",
                      )}
                    >
                      {getPlanIcon(plan.id)}
                    </div>
                  </div>

                  {/* Price */}
                  <div className="mb-6">
                    <AnimatePresence mode="wait">
                      <motion.div
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        initial={{ opacity: 0, y: 10 }}
                        key={isAnnually ? "year" : "month"}
                        transition={{ duration: 0.2 }}
                      >
                        {isAnnually ? (
                          <div className="flex items-baseline gap-1">
                            <span
                              className={cn(priceTextVariants({ size, theme }))}
                            >
                              {Number.parseFloat(plan.yearlyPrice) >= 0 &&
                                plan.yearlyPrice.toLowerCase() !== "custom" &&
                                plan.currency}
                              {plan.yearlyPrice}
                            </span>
                            <span className="text-muted-foreground text-sm">
                              /year
                            </span>
                            {calculateDiscount(
                              plan.monthlyPrice,
                              plan.yearlyPrice,
                            ) > 0 && (
                              <span
                                className={cn(
                                  "ml-2 text-xs",
                                  theme === "classic"
                                    ? "font-semibold text-emerald-500"
                                    : "font-medium text-primary",
                                )}
                              >
                                {calculateDiscount(
                                  plan.monthlyPrice,
                                  plan.yearlyPrice,
                                )}
                                % off
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-baseline gap-1">
                            <span
                              className={cn(priceTextVariants({ size, theme }))}
                            >
                              {Number.parseFloat(plan.monthlyPrice) >= 0 &&
                                plan.monthlyPrice.toLowerCase() !==
                                  "custom" && <>{plan.currency}</>}
                              {plan.monthlyPrice}
                            </span>
                            <span className="text-muted-foreground text-sm">
                              /month
                            </span>
                          </div>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </div>

                  {/* CTA Button */}
                  <div className="mb-6">
                    <Button
                      className={cn(
                        buttonVariants({ theme }),
                        !plan.highlight &&
                          theme === "minimal" &&
                          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                      )}
                      onClick={() => handlePlanSelect(plan.id)}
                      variant={plan.highlight ? "default" : "secondary"}
                    >
                      {plan.buttonText}
                      {theme === "classic" && plan.highlight && (
                        <div className="absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-white/0 via-white/10 to-white/0 transition-transform duration-700 hover:translate-x-[100%]" />
                      )}
                    </Button>
                  </div>

                  {/* Features */}
                  <div className="flex-1">
                    <ul className="space-y-3">
                      {plan.features.map((feature, featureIndex) => (
                        <motion.li
                          animate={{ opacity: 1, x: 0 }}
                          className="flex items-start gap-3"
                          initial={{ opacity: 0, x: -10 }}
                          // biome-ignore lint/suspicious/noArrayIndexKey: safe to use
                          key={featureIndex}
                          transition={{
                            duration: 0.3,
                            delay: featureIndex * 0.05,
                          }}
                        >
                          <Check
                            className={cn(featureIconVariants({ size, theme }))}
                          />
                          <span
                            className={cn(
                              "text-sm",
                              theme === "classic"
                                ? "text-foreground/90"
                                : "text-muted-foreground",
                            )}
                          >
                            {feature.name}
                          </span>
                        </motion.li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
