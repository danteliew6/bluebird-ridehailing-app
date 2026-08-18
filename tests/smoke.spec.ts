import { test, expect } from '@playwright/test';

test('home redirects to Operations overview and renders KPIs', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Bluebird', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Operations Overview' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Operations' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'AI/BI Dashboard' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Data Access' })).toBeVisible();
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

test('Data Access (RBAC/ABAC) page loads', async ({ page }) => {
  await page.goto('/access');
  await expect(page.getByRole('heading', { name: 'Governed Data Access — RBAC + ABAC' })).toBeVisible();
  await expect(page.getByText('Jakarta Ops').first()).toBeVisible();
});

test('Architecture page loads', async ({ page }) => {
  await page.goto('/architecture');
  await expect(page.getByRole('heading', { name: 'End-to-End Architecture' })).toBeVisible();
});

test('AI/BI Dashboard page loads', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'AI/BI Dashboard (embedded)' })).toBeVisible();
});
