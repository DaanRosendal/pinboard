export type User = {
  id: string
  email: string
  name: string
  role: "admin" | "member" | "viewer"
  createdAt: Date
}

export type UserProfile = User & {
  avatarUrl?: string
  bio?: string
}
