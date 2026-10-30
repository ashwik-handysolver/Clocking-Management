import { test, expect } from '@playwright/test';

test('TC01 - Verify the sign-in screen', async ({ page }) => {
  await page.goto('/');

  // Verify the sign-in page is displayed.
  await expect(
    page.getByRole('heading', { name: 'Welcome back' })
  ).toBeVisible();

  await expect(
    page.getByRole('heading', { name: 'Every hour, accounted for.' })
  ).toBeVisible();

  // Verify the email and password fields exist.
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();

  // Verify the available sign-in actions.
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true })
  ).toBeVisible();
  const signUpButton = page.getByRole('button', {
  name: 'Sign up',
  exact: true,
});

const signUpText = page.getByText('Sign up', {
  exact: true,
});

console.log('Sign up button visible:', await signUpButton.isVisible().catch(() => false));
console.log('Sign up text visible:', await signUpText.isVisible().catch(() => false));
  await expect(
    page.getByRole('button', { name: 'Continue with Google' })
  ).toBeVisible();

  await expect(
    page.getByRole('button', { name: 'Forgot password?' })
  ).toBeVisible();
});