export async function exchangeGithubCode(code: string): Promise<{ login: string; id: number }> {
  // Exchange OAuth code for user info
  return { login: "octocat", id: 1 }
}
