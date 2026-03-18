import { sign, verify } from "jsonwebtoken"

const SECRET = process.env.JWT_SECRET!

export function signToken(payload: object): string {
  return sign(payload, SECRET, { expiresIn: "7d" })
}

export function verifyToken(token: string): object {
  return verify(token, SECRET) as object
}
