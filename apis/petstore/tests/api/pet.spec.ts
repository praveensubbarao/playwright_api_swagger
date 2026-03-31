import { test, expect } from '@playwright/test';
import { buildPet } from '../fixtures/factories';
import type { Pet } from '../types/petstore';

test.describe('Pet API', () => {
  test('POST /pet - adds a new pet', async ({ request }) => {
    const pet = buildPet();

    const response = await request.post('pet', { data: pet });

    expect(response.status()).toBe(200);
    const body: Pet = await response.json();
    expect(body.id).toBeDefined();
    expect(body.name).toBe(pet.name);
    expect(body.status).toBe('available');
  });

  test('GET /pet/{petId} - retrieves a pet by ID', async ({ request }) => {
    const pet = buildPet();
    const created: Pet = await (await request.post('pet', { data: pet })).json();

    const response = await request.get(`pet/${created.id}`);

    expect(response.status()).toBe(200);
    const body: Pet = await response.json();
    expect(body.id).toBe(created.id);
    expect(body.name).toBe(pet.name);
  });

  test('PUT /pet - updates an existing pet', async ({ request }) => {
    const pet = buildPet();
    const created: Pet = await (await request.post('pet', { data: pet })).json();

    const updated: Pet = { ...created, name: 'UpdatedName', status: 'pending' };
    const response = await request.put('pet', { data: updated });

    expect(response.status()).toBe(200);
    const body: Pet = await response.json();
    expect(body.name).toBe('UpdatedName');
    expect(body.status).toBe('pending');
  });

  test('DELETE /pet/{petId} - deletes a pet', async ({ request }) => {
    const pet = buildPet();
    const created: Pet = await (await request.post('pet', { data: pet })).json();

    const response = await request.delete(`pet/${created.id}`);

    expect(response.status()).toBe(200);
  });

  test('GET /pet/findByStatus - finds available pets', async ({ request }) => {
    const response = await request.get('pet/findByStatus', {
      params: { status: 'available' },
    });

    expect(response.status()).toBe(200);
    const body: Pet[] = await response.json();
    expect(Array.isArray(body)).toBe(true);
    body.slice(0, 5).forEach((pet) => expect(pet.status).toBe('available'));
  });

  test('GET /pet/findByStatus - finds pending pets', async ({ request }) => {
    const response = await request.get('pet/findByStatus', {
      params: { status: 'pending' },
    });

    expect(response.status()).toBe(200);
    const body: Pet[] = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /pet/{petId} - returns 404 for non-existent pet', async ({ request }) => {
    const response = await request.get('pet/999999999');

    expect(response.status()).toBe(404);
  });

  test('POST /pet - full lifecycle: create, read, update, delete', async ({ request }) => {
    // Create
    const pet = buildPet({ status: 'available' });
    const createRes = await request.post('pet', { data: pet });
    expect(createRes.status()).toBe(200);
    const created: Pet = await createRes.json();

    // Read
    const getRes = await request.get(`pet/${created.id}`);
    expect(getRes.status()).toBe(200);

    // Update
    const updateRes = await request.put('pet', {
      data: { ...created, status: 'sold' },
    });
    expect(updateRes.status()).toBe(200);
    const updated: Pet = await updateRes.json();
    expect(updated.status).toBe('sold');

    // Delete
    const deleteRes = await request.delete(`pet/${created.id}`);
    expect(deleteRes.status()).toBe(200);

    // Confirm deletion
    const afterDelete = await request.get(`pet/${created.id}`);
    expect(afterDelete.status()).toBe(404);
  });

  test.skip('POST /pet/{petId}/uploadImage - TODO: uploads an image', async ({ request }) => {
    // TODO: create or obtain a real ID
    const petId = TODO_PETID;
    const payload = buildPet();
    const response = await request.post(`pet/${petId}/uploadImage`, { data: payload });

    expect(response.status()).toBe(200);
    const body: Pet = await response.json();
    // TODO: add assertions for body
  });
  test.skip('POST /pet/{petId} - TODO: Updates a pet in the store with form data', async ({ request }) => {
    // TODO: create or obtain a real ID
    const petId = TODO_PETID;
    const payload = buildPet();
    const response = await request.post(`pet/${petId}`, { data: payload });

    expect(response.status()).toBe(200);
    const body: Pet = await response.json();
    // TODO: add assertions for body
  });
  test.skip('GET /pet/findByTags - TODO: Finds Pets by tags', async ({ request }) => {
    const response = await request.get('pet/findByTags');

    expect(response.status()).toBe(200);
    const body: Pet = await response.json();
    // TODO: add assertions for body
  });
});
