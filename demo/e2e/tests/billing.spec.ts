import { test, expect } from "@playwright/test"

test.describe("Billing", () => {
  test("user can upgrade to Pro plan", async ({ page }) => {
    await page.goto("/billing")
    await page.click('[data-plan="pro"]')
    await expect(page).toHaveURL(/checkout\.stripe\.com/)
  })

  test("user can view invoices", async ({ page }) => {
    await page.goto("/billing/invoices")
    await expect(page.locator('[data-testid="invoice-list"]')).toBeVisible()
  })
})
