import { test, expect } from '@playwright/test';
import { buildPet, buildOrder } from '../fixtures/factories';
import type { Order, Pet } from '../types/petstore';

test.describe('Store API', () => {
  test('GET /store/inventory - returns inventory counts by status', async ({ request }) => {
    const response = await request.get('store/inventory');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(typeof body).toBe('object');
    // Inventory is a map of status string -> count
    Object.values(body).forEach((count) => expect(typeof count).toBe('number'));
  });

  test('POST /store/order - places an order for a pet', async ({ request }) => {
    const pet = buildPet();
    const created: Pet = await (await request.post('pet', { data: pet })).json();
    const order = buildOrder(created.id!);

    const response = await request.post('store/order', { data: order });

    expect(response.status()).toBe(200);
    const body: Order = await response.json();
    expect(body.id).toBeDefined();
    expect(body.petId).toBe(order.petId);
    expect(body.status).toBe('placed');
  });

  test('GET /store/order/{orderId} - retrieves a placed order', async ({ request }) => {
    const pet = buildPet();
    const created: Pet = await (await request.post('pet', { data: pet })).json();
    const order = buildOrder(created.id!);
    const placed: Order = await (await request.post('store/order', { data: order })).json();

    const response = await request.get(`store/order/${placed.id}`);

    expect(response.status()).toBe(200);
    const body: Order = await response.json();
    expect(body.id).toBe(placed.id);
    expect(body.petId).toBe(order.petId);
  });

  test('DELETE /store/order/{orderId} - deletes a placed order', async ({ request }) => {
    const pet = buildPet();
    const created: Pet = await (await request.post('pet', { data: pet })).json();
    const order = buildOrder(created.id!);
    const placed: Order = await (await request.post('store/order', { data: order })).json();

    const response = await request.delete(`store/order/${placed.id}`);

    expect(response.status()).toBe(200);
  });

  test('GET /store/order/{orderId} - returns 404 for non-existent order', async ({ request }) => {
    const response = await request.get('store/order/999999999');

    expect(response.status()).toBe(404);
  });

  test('POST /store/order - full order lifecycle', async ({ request }) => {
    // Create a pet to order
    const pet = buildPet({ status: 'available' });
    const createdPet: Pet = await (await request.post('pet', { data: pet })).json();

    // Place order
    const order = buildOrder(createdPet.id!, { quantity: 2 });
    const placeRes = await request.post('store/order', { data: order });
    expect(placeRes.status()).toBe(200);
    const placed: Order = await placeRes.json();
    expect(placed.quantity).toBe(2);

    // Retrieve order
    const getRes = await request.get(`store/order/${placed.id}`);
    expect(getRes.status()).toBe(200);

    // Delete order
    const deleteRes = await request.delete(`store/order/${placed.id}`);
    expect(deleteRes.status()).toBe(200);

    // Confirm deletion
    const afterDelete = await request.get(`store/order/${placed.id}`);
    expect(afterDelete.status()).toBe(404);
  });
});
