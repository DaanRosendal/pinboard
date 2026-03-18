import { Router } from "express"

export const authRouter = Router()

authRouter.post("/login", async (req, res) => {
  res.json({ token: "placeholder" })
})

authRouter.post("/logout", async (req, res) => {
  res.json({ ok: true })
})
