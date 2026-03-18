export async function exchangeGoogleCode(code: string): Promise<{ email: string; sub: string }> {
  // Exchange OAuth code for user info
  return { email: "user@example.com", sub: "google-sub-id" }
}
