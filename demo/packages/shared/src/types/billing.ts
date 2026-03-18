export type Plan = "free" | "pro" | "enterprise"

export type Subscription = {
  id: string
  userId: string
  plan: Plan
  status: "active" | "canceled" | "past_due"
  currentPeriodEnd: Date
}

export type Invoice = {
  id: string
  subscriptionId: string
  amount: number
  currency: string
  status: "paid" | "open" | "void"
  createdAt: Date
}
