import { test, expect } from "@playwright/test"

test.describe("Dashboard", () => {
  test("renders metrics", async ({ page }) => {
    await page.goto("/dashboard")
    await expect(page.locator("h2")).toContainText("Dashboard")
  })

  test("sidebar navigation works", async ({ page }) => {
    await page.goto("/dashboard")
    await page.click('a[href="/users"]')
    await expect(page).toHaveURL("/users")
  })
})
