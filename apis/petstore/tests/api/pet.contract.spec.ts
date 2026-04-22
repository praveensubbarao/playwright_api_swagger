import { test, expect } from '@playwright/test';
import { buildPet } from '../fixtures/factories';

// Schema validators derived from OpenAPI 3.0 spec (openapi.json)

function assertTagContract(tag: unknown, path: string): void {
  expect(typeof tag, `${path} must be object`).toBe('object');
  const t = tag as Record<string, unknown>;
  if ('id' in t) expect(typeof t.id, `${path}.id must be number`).toBe('number');
  if ('name' in t) expect(typeof t.name, `${path}.name must be string`).toBe('string');
}

function assertCategoryContract(category: unknown, path: string): void {
  expect(typeof category, `${path} must be object`).toBe('object');
  const c = category as Record<string, unknown>;
  if ('id' in c) expect(typeof c.id, `${path}.id must be number`).toBe('number');
  if ('name' in c) expect(typeof c.name, `${path}.name must be string`).toBe('string');
}

function assertPetContract(body: unknown): void {
  expect(body).not.toBeNull();
  expect(typeof body).toBe('object');
  const pet = body as Record<string, unknown>;

  // required fields
  expect(typeof pet.name, 'Pet.name must be string').toBe('string');
  expect(Array.isArray(pet.photoUrls), 'Pet.photoUrls must be array').toBe(true);
  (pet.photoUrls as unknown[]).forEach((url, i) =>
    expect(typeof url, `Pet.photoUrls[${i}] must be string`).toBe('string'),
  );

  // optional fields — only validate type when present
  if (pet.id !== undefined)
    expect(typeof pet.id, 'Pet.id must be number').toBe('number');

  if (pet.category !== undefined)
    assertCategoryContract(pet.category, 'Pet.category');

  if (pet.tags !== undefined) {
    expect(Array.isArray(pet.tags), 'Pet.tags must be array').toBe(true);
    (pet.tags as unknown[]).forEach((tag, i) => assertTagContract(tag, `Pet.tags[${i}]`));
  }

  if (pet.status !== undefined)
    expect(['available', 'pending', 'sold'], 'Pet.status must be valid enum').toContain(pet.status);
}

test.describe('Pet API — Contract', () => {
  test('POST /pet — response body conforms to Pet schema', async ({ request }) => {
    const pet = buildPet();

    const response = await request.post('pet', { data: pet });

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    assertPetContract(await response.json());
  });

  test('GET /pet/{petId} — response body conforms to Pet schema', async ({ request }) => {
    const created = await (await request.post('pet', { data: buildPet() })).json();

    const response = await request.get(`pet/${created.id}`);

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    assertPetContract(await response.json());
  });

  test('PUT /pet — response body conforms to Pet schema', async ({ request }) => {
    const created = await (await request.post('pet', { data: buildPet() })).json();
    const updated = { ...created, name: 'ContractUpdated', status: 'pending' };

    const response = await request.put('pet', { data: updated });

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    assertPetContract(await response.json());
  });

  test('GET /pet/findByStatus — response body conforms to Pet[] schema', async ({ request }) => {
    // Create a known pet so the result set contains at least one well-formed item we own
    const pet = buildPet({ status: 'available' });
    const created = await (await request.post('pet', { data: pet })).json() as Record<string, unknown>;

    const response = await request.get('pet/findByStatus', {
      params: { status: 'available' },
    });

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');

    const body = await response.json() as unknown[];
    expect(Array.isArray(body), 'findByStatus must return an array').toBe(true);

    // Find and validate our specific pet — avoids relying on stale demo-server data
    const found = body.find(
      (item) => (item as Record<string, unknown>).id === created.id,
    );
    expect(found, 'created pet must appear in findByStatus results').toBeDefined();
    assertPetContract(found);
    expect((found as Record<string, unknown>).status).toBe('available');
  });

  test('GET /pet/{petId} — 404 after deletion', async ({ request }) => {
    // Create then immediately delete so we own the lifecycle; avoids relying on demo-server state
    const created = await (await request.post('pet', { data: buildPet() })).json() as Record<string, unknown>;
    await request.delete(`pet/${created.id}`);

    const response = await request.get(`pet/${created.id}`);

    expect(response.status()).toBe(404);
  });

  test('POST /pet — required fields (name, photoUrls) are echoed back', async ({ request }) => {
    const pet = buildPet({ name: 'ContractPet', photoUrls: ['https://example.com/img.jpg'] });

    const response = await request.post('pet', { data: pet });
    const body = await response.json() as Record<string, unknown>;

    expect(response.status()).toBe(200);
    expect(body.name).toBe('ContractPet');
    expect(Array.isArray(body.photoUrls)).toBe(true);
    expect((body.photoUrls as string[])[0]).toBe('https://example.com/img.jpg');
  });

  test('POST /pet — optional fields are preserved when supplied', async ({ request }) => {
    const pet = buildPet({
      category: { id: 7, name: 'Reptiles' },
      tags: [{ id: 3, name: 'exotic' }],
      status: 'sold',
    });

    const response = await request.post('pet', { data: pet });
    const body = await response.json() as Record<string, unknown>;

    expect(response.status()).toBe(200);
    assertPetContract(body);

    const category = body.category as Record<string, unknown>;
    expect(category.id).toBe(7);
    // forced typo in check to demonstrate test failure when contract is violated — should be 'Reptiles'
    expect(category.name).toBe('Retpiles');

    const tags = body.tags as Record<string, unknown>[];
    expect(tags[0].name).toBe('exotic');
    expect(body.status).toBe('sold');
  });
});
