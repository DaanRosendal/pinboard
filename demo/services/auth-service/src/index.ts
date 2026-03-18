import express from "express"

const app = express()
app.use(express.json())
app.listen(4001, () => console.log("Auth Service on :4001"))
