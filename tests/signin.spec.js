import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

test('TC01 - Sign in with valid credentials', async ({ page }) => {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  // Ensure credentials are configured before starting.
  if (!email || !password) {
    throw new Error(
      'Test credentials are missing. Configure TEST_USER_EMAIL and TEST_USER_PASSWORD in .env.local.'
    );
  }

  // Open the application.
  await page.goto('/');

  // Verify the sign-in page is displayed.
  await expect(
    page.getByRole('heading', { name: 'Welcome back' })
  ).toBeVisible();

  // Enter valid credentials.
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);

  // Submit the sign-in form.
  await page.getByRole('button', {
    name: 'Sign in',
    exact: true,
  }).click();

  // Wait for the application to respond.
  await page.waitForLoadState('domcontentloaded');

  // Report the result for investigation.
  console.log('URL after sign-in:', page.url());
  console.log('Page title after sign-in:', await page.title());

  // Temporary checkpoint: inspect the result before defining
  // the final assertion for successful authentication.
  await page.waitForTimeout(2000);

  console.log(
    'Password field still visible:',
    await page.locator('input[type="password"]').isVisible().catch(() => false)
  );
});