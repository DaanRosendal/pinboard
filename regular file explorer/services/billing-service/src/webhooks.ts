import type { Request, Response } from "express"

export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  const event = req.body
  switch (event.type) {
    case "invoice.paid":
      break
    case "customer.subscription.deleted":
      break
  }
  res.json({ received: true })
}
