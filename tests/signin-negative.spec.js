import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

test('TC02 - Verify sign-in rejects an invalid password', async ({ page }) => {
  const email = process.env.TEST_USER_EMAIL;

  if (!email) {
    throw new Error('TEST_USER_EMAIL is missing from .env.local');
  }

  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'Welcome back' })
  ).toBeVisible();

  await page.locator('input[type="email"]').fill(email);

  // Use an intentionally incorrect password.
  await page.locator('input[type="password"]').fill(
    'InvalidPassword_ForTesting_123!'
  );

  await page.getByRole('button', {
    name: 'Sign in',
    exact: true,
  }).click();

  // The application should not authenticate the user.
  await expect(
    page.locator('input[type="password"]')
  ).toBeVisible();

  console.log('The sign-in form remains visible after the attempt.');
});