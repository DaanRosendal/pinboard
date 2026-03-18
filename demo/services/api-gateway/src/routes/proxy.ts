import { Router } from "express"

export const proxyRouter = Router()

proxyRouter.all("/:service/*", async (req, res) => {
  // Forward to downstream service
  res.json({ forwarded: true })
})
