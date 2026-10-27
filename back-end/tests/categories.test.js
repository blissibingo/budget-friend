const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/index');
const { ensureDefaultUser, clearCustomCategories, pool } = require('./helpers/testDb');

let server;
let baseUrl;

before(async () => {
  await ensureDefaultUser();
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  await pool.end();
});

beforeEach(async () => {
  await clearCustomCategories();
});

test('lists default categories', async () => {
  const res = await fetch(`${baseUrl}/api/categories`);
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.ok(body.categories.some(c => c.name === 'Groceries' && c.user_id === null));
});

test('lists default categories plus the user\'s own', async () => {
  const createRes = await fetch(`${baseUrl}/api/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Hobbies' }),
  });
  assert.equal(createRes.status, 200);

  const res = await fetch(`${baseUrl}/api/categories`);
  const body = await res.json();

  assert.ok(body.categories.some(c => c.name === 'Groceries' && c.user_id === null));
  assert.ok(body.categories.some(c => c.name === 'Hobbies' && c.user_id !== null));
});

test('creates a category scoped to the hardcoded user', async () => {
  const res = await fetch(`${baseUrl}/api/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Hobbies' }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.category.name, 'Hobbies');
  assert.equal(Number(body.category.user_id), 1);
});

test('rejects category creation with no name', async () => {
  const res = await fetch(`${baseUrl}/api/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
});

test('rejects category creation with a whitespace-only name', async () => {
  const res = await fetch(`${baseUrl}/api/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '   ' }),
  });
  assert.equal(res.status, 400);
});

test('rejects a duplicate category name for the same user', async () => {
  const first = await fetch(`${baseUrl}/api/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Hobbies' }),
  });
  assert.equal(first.status, 200);

  const second = await fetch(`${baseUrl}/api/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Hobbies' }),
  });
  assert.equal(second.status, 409);
});

function createCategory(body) {
  return fetch(`${baseUrl}/api/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('seeds Transfer and Savings as excluded defaults', async () => {
  const res = await fetch(`${baseUrl}/api/categories`);
  const { categories } = await res.json();

  for (const name of ['Transfer', 'Savings']) {
    const seeded = categories.find(c => c.name === name && c.user_id === null);
    assert.ok(seeded, `no default ${name} category`);
    assert.equal(seeded.excluded_from_spend, true);
  }
});

test('Income is a default category that is not excluded', async () => {
  const res = await fetch(`${baseUrl}/api/categories`);
  const { categories } = await res.json();

  const income = categories.find(c => c.name === 'Income' && c.user_id === null);
  assert.equal(income.excluded_from_spend, false);
});

test('listed categories carry a colour and an exclusion flag', async () => {
  const res = await fetch(`${baseUrl}/api/categories`);
  const { categories } = await res.json();

  for (const c of categories) {
    assert.ok('color' in c, `${c.name} has no color field`);
    assert.equal(typeof c.excluded_from_spend, 'boolean');
  }
});

test('creates a category with a colour', async () => {
  const res = await createCategory({ name: 'Hobbies', color: '#3b82f6' });
  assert.equal(res.status, 200);
  const { category } = await res.json();

  assert.equal(category.color, '#3b82f6');
  assert.equal(category.excluded_from_spend, false);
});

test('creates a category with no colour', async () => {
  const res = await createCategory({ name: 'Hobbies' });
  const { category } = await res.json();

  assert.equal(category.color, null);
});

test('rejects a colour that is not a six-digit hex code', async () => {
  for (const color of ['blue', '#fff', '3b82f6', 42]) {
    const res = await createCategory({ name: 'Hobbies', color });
    assert.equal(res.status, 400, `accepted ${JSON.stringify(color)}`);
  }
});
