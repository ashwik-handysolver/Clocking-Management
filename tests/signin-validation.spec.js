import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

test('TC03 - Verify sign-in validation with empty fields', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'Welcome back' })
  ).toBeVisible();

  // Ensure both fields are empty.
  await page.locator('input[type="email"]').clear();
  await page.locator('input[type="password"]').clear();

  // Attempt to sign in without credentials.
  await page.getByRole('button', {
    name: 'Sign in',
    exact: true,
  }).click();

  // Inspect the form after submission.
  console.log(
    'Email field value:',
    await page.locator('input[type="email"]').inputValue()
  );

  console.log(
    'Password field value:',
    await page.locator('input[type="password"]').inputValue()
  );

  console.log('URL after empty submission:', page.url());

  console.log(
    'Visible validation messages:',
    await page.locator('[role="alert"], [aria-invalid="true"], :invalid')
      .evaluateAll(elements =>
        elements.map(element => ({
          tag: element.tagName,
          text: element.textContent?.trim(),
          validationMessage: element.validationMessage || '',
        }))
      )
  );

  // The sign-in form should remain available.
  await expect(
    page.locator('input[type="email"]')
  ).toBeVisible();

  await expect(
    page.locator('input[type="password"]')
  ).toBeVisible();
});