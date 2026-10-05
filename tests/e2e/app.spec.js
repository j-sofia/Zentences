import { expect, test } from '@playwright/test';

test('imports real notes and browses/searches the vocabulary bank', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Zentences/ })).toBeVisible();
  await page.getByRole('button', { name: 'Vocabulary', exact: false }).first().click();
  await expect(page.getByRole('heading', { name: 'Your vocabulary.' })).toBeVisible();
  await page.getByPlaceholder(/search/i).fill('学校');
  await expect(page.locator('main').getByText('学校', { exact: true }).first()).toBeVisible();
  await expect(
    page.locator('.vocabulary-row').getByText('school', { exact: false }).first(),
  ).toBeVisible();
});

test('completes a translation, reveals feedback, and reviews saved progress', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Begin practice', exact: true }).click();
  await expect(page.locator('main').getByText('我今天想去学校。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show pinyin' }).click();
  await expect(page.getByText('Wǒ jīntiān xiǎng qù xuéxiào.', { exact: true })).toBeVisible();
  await page.getByLabel('Your English translation').fill('I want to go to school today.');
  await page.getByLabel('Your English translation').press('Meta+Enter');
  await expect(
    page.getByText('You captured the subject, intention, place, and time.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next sentence' })).toBeEnabled();
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await expect(
    page.locator('.history-row').getByText('我今天想去学校。', { exact: true }).first(),
  ).toBeVisible();
});

test('shows model onboarding when Ollama is unavailable', async ({ page }) => {
  await page.route('**/api/bootstrap', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.data.runtime = { connected: false, models: [], running: [] };
    await route.fulfill({ json: body });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Set up & begin' }).click();
  await expect(page.getByRole('link', { name: /Download Ollama for Mac/ })).toHaveAttribute(
    'href',
    'https://ollama.com/download/mac',
  );
  await expect(page.getByText('Qwen3 14B', { exact: true })).toBeVisible();
  await expect(page.getByText('64 GB unified memory', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Start local runtime' }).click();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
});

test('updates the focus selector when generation switches words', async ({ page }) => {
  const bootstrap = await (await page.request.get('/api/bootstrap')).json();
  const original = bootstrap.data.words.find((word) => word.hanzi === '我');
  const replacement = bootstrap.data.words.find((word) => word.hanzi === '学校');
  await page.route('**/api/generate', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.data.target = replacement;
    await route.fulfill({ json: body });
  });
  await page.goto('/');
  await page.getByLabel('FOCUS WORD', { exact: true }).selectOption(original.id);
  await page.getByRole('button', { name: 'Begin practice', exact: true }).click();
  await expect(page.getByLabel('Your English translation')).toBeEditable();
  await expect(page.getByLabel('FOCUS WORD', { exact: true })).toHaveValue(replacement.id);
  await expect(page.locator('.focus-hanzi')).toHaveText('学校');
});

test('preserves Surprise me after switching focus and for the next sentence', async ({ page }) => {
  const bootstrap = await (await page.request.get('/api/bootstrap')).json();
  const replacement = bootstrap.data.words.find((word) => word.hanzi === '学校');
  const inputs = [];
  await page.route('**/api/generate', async (route) => {
    inputs.push(route.request().postDataJSON());
    const response = await route.fetch();
    const body = await response.json();
    body.data.target = replacement;
    await route.fulfill({ json: body });
  });
  await page.goto('/');
  await page.getByLabel('FOCUS WORD', { exact: true }).selectOption('');
  await page.getByRole('button', { name: 'Begin practice', exact: true }).click();
  await expect(page.getByLabel('Your English translation')).toBeEditable();
  await expect(page.getByLabel('FOCUS WORD', { exact: true })).toHaveValue('');
  await expect(page.locator('.focus-hanzi')).toHaveText('学校');
  await page.getByRole('button', { name: 'Generate another sentence', exact: true }).click();
  await expect(page.getByLabel('Your English translation')).toBeEditable();
  expect(inputs).toHaveLength(2);
  expect(inputs.every((input) => !Object.hasOwn(input, 'targetId'))).toBe(true);
  await expect(page.getByLabel('FOCUS WORD', { exact: true })).toHaveValue('');
});

test('preserves a switch to Surprise me while generation is pending', async ({ page }) => {
  const bootstrap = await (await page.request.get('/api/bootstrap')).json();
  const original = bootstrap.data.words.find((word) => word.hanzi === '我');
  const replacement = bootstrap.data.words.find((word) => word.hanzi === '学校');
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/api/generate', async (route) => {
    await pending;
    const response = await route.fetch();
    const body = await response.json();
    body.data.target = replacement;
    await route.fulfill({ json: body });
  });
  await page.goto('/');
  await page.getByLabel('FOCUS WORD', { exact: true }).selectOption(original.id);
  await page.getByRole('button', { name: 'Begin practice', exact: true }).click();
  await expect(page.getByText('Finding your next sentence…')).toBeVisible();
  await page.getByLabel('FOCUS WORD', { exact: true }).selectOption('');
  release();
  await expect(page.getByLabel('Your English translation')).toBeEditable();
  await expect(page.getByLabel('FOCUS WORD', { exact: true })).toHaveValue('');
  await expect(page.locator('.focus-hanzi')).toHaveText('学校');
});

test('supports mobile navigation without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: /practice/i }).first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
});

test('downloads and selects a model using the setup wizard', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Local model', exact: true }).click();
  const card = page
    .locator('.model-card')
    .filter({ has: page.getByRole('heading', { name: 'Qwen3 8B', exact: true }) });
  await card.getByRole('button', { name: 'Download model', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Selected', exact: true })).toBeVisible();
  await expect(page.getByText('Your model is ready. Time for a little Chinese.')).toBeVisible();
});
test('favorites and settings survive a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Vocabulary', exact: true }).click();
  await page.getByLabel('Search vocabulary').fill('学校');
  await page.getByRole('button', { name: 'Favorite 学校', exact: true }).click();
  await page.getByRole('button', { name: 'Favorites', exact: false }).click();
  await expect(page.locator('.vocabulary-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Daily goal', { exact: true }).selectOption('15');
  await page.getByLabel('Default difficulty', { exact: true }).selectOption('gentle');
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Daily goal', { exact: true })).toHaveValue('15');
  await expect(page.getByLabel('Default difficulty', { exact: true })).toHaveValue('gentle');
  await page.getByRole('button', { name: 'Vocabulary', exact: true }).click();
  await page.getByRole('button', { name: 'Favorites', exact: false }).click();
  await expect(page.locator('.vocabulary-row').getByText('学校', { exact: true })).toBeVisible();
});
test('displays a useful error when the model cannot generate', async ({ page }) => {
  await page.route('**/api/generate', (route) =>
    route.fulfill({
      status: 503,
      json: {
        success: false,
        error: 'Ollama is not running. Open Local model and start the runtime.',
      },
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Begin practice', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Ollama is not running');
  await expect(page.getByRole('button', { name: 'Begin practice', exact: true })).toBeEnabled();
});

test('can cancel pending generation and begin again', async ({ page }) => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/api/generate', async (route) => {
    await pending;
    await route.abort().catch(() => {});
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Begin practice', exact: true }).click();
  await expect(page.getByText('Finding your next sentence…')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel generation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Begin practice', exact: true })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  release();
  await page.unroute('**/api/generate');
  await page.getByRole('button', { name: 'Begin practice', exact: true }).click();
  await expect(page.getByLabel('Your English translation')).toBeEditable();
});

test('finishes a complete practice session and starts a fresh one', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Sentences per session', { exact: true }).selectOption('5');
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await page.getByRole('button', { name: 'Begin practice', exact: true }).click();
  for (let index = 0; index < 5; index++) {
    await page.getByLabel('Your English translation').fill('I want to go to school today.');
    await page.getByRole('button', { name: 'Check translation', exact: true }).click();
    await expect(
      page.getByText('You captured the subject, intention, place, and time.'),
    ).toBeVisible();
    await page
      .getByRole('button', { name: index === 4 ? 'Finish session' : 'Next sentence', exact: true })
      .click();
  }
  await expect(page.getByRole('heading', { name: 'You showed up. That counts.' })).toBeVisible();
  await expect(page.getByText('You translated 5 sentences in this session.')).toBeVisible();
  await page.getByRole('button', { name: 'Start a fresh session', exact: false }).click();
  await expect(page.getByLabel('Your English translation')).toBeEditable();
});
