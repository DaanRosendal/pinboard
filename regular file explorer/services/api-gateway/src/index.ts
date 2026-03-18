import express from "express"
import { authRouter } from "./routes/auth"
import { proxyRouter } from "./routes/proxy"

const app = express()
app.use(express.json())
app.use("/auth", authRouter)
app.use("/api", proxyRouter)
app.listen(4000, () => console.log("API Gateway on :4000"))
