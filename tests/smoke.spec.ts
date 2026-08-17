import { test, expect } from '@playwright/test';

test('home redirects to Operations overview and renders KPIs', async ({ page }) => {
  await page.goto('/');
  // brand present
  await expect(page.getByText('Bluebird', { exact: true }).first()).toBeVisible();
  // overview heading
  await expect(page.getByRole('heading', { name: 'Operations Overview' })).toBeVisible();
  // nav links
  await expect(page.getByRole('link', { name: 'Operations' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ask Bluebird' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Fleet & Forecast' })).toBeVisible();
  // at least one KPI label
  await expect(page.getByText('Completed Trips').first()).toBeVisible({ timeout: 20000 });
});

test('Ask Bluebird (Genie) page loads', async ({ page }) => {
  await page.goto('/ask');
  await expect(page.getByRole('heading', { name: 'Ask Bluebird' })).toBeVisible();
});

test('Fleet & Forecast page loads', async ({ page }) => {
  await page.goto('/fleet');
  await expect(page.getByRole('heading', { name: 'Fleet Health & Demand Forecast' })).toBeVisible();
  await expect(page.getByText('Live Maintenance Prediction (what-if)')).toBeVisible();
});
