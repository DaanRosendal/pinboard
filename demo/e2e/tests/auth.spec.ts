import { test, expect } from "@playwright/test"

test.describe("Authentication", () => {
  test("user can log in with email", async ({ page }) => {
    await page.goto("/login")
    await page.fill('[name="email"]', "user@example.com")
    await page.fill('[name="password"]', "password")
    await page.click('[type="submit"]')
    await expect(page).toHaveURL("/dashboard")
  })

  test("user can log out", async ({ page }) => {
    await page.goto("/dashboard")
    await page.click('[data-testid="logout-btn"]')
    await expect(page).toHaveURL("/login")
  })
})
