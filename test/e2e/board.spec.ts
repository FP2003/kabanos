import { expect, test } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

test('board supports details, settings, keyboard drag controls, and accessible structure',async({page})=>{
  await page.goto('/admin/kb/');
  await expect(page.getByRole('main',{name:'Kanban board'})).toBeVisible();
  await expect(page.getByText('test keyboard dragging')).toBeVisible();

  const card=page.getByText('test keyboard dragging').locator('../..');
  await card.focus();await page.keyboard.press('Alt+ArrowRight');
  await expect(page.getByRole('region',{name:'In Progress'}).getByText('test keyboard dragging')).toBeVisible();

  await page.getByText('test details').click();
  await expect(page.getByRole('dialog',{name:'test details'})).toBeVisible();
  await page.getByLabel('Notes').fill('Browser-tested note');
  await page.getByRole('button',{name:'Save details'}).click();

  await page.getByRole('button',{name:'Open settings'}).click();
  await page.getByLabel('Theme').selectOption('dark');
  await page.getByRole('button',{name:'Save settings'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');

  const results=await new AxeBuilder({page}).analyze();
  expect(results.violations.filter(violation=>['critical','serious'].includes(violation.impact??''))).toEqual([]);
});
