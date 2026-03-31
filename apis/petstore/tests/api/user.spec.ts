import { test, expect } from '@playwright/test';
import { buildUser } from '../fixtures/factories';
import type { User } from '../types/petstore';

test.describe('User API', () => {
  test('POST /user/createWithList - creates a list of users', async ({ request }) => {
    const users: User[] = Array.from({ length: 3 }, () => buildUser());

    const response = await request.post('user/createWithList', { data: users });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.code).toBe(200);
  });

  test('POST /user - creates a single user', async ({ request }) => {
    const user = buildUser();

    const response = await request.post('user', { data: user });

    expect(response.status()).toBe(200);
  });

  test('GET /user/{username} - retrieves a created user', async ({ request }) => {
    const user = buildUser();
    await request.post('user', { data: user });

    const response = await request.get(`user/${user.username}`);

    expect(response.status()).toBe(200);
    const body: User = await response.json();
    expect(body.username).toBe(user.username);
    expect(body.email).toBe(user.email);
  });

  test('PUT /user/{username} - updates a user', async ({ request }) => {
    const user = buildUser();
    await request.post('user', { data: user });

    const updated = { ...user, firstName: 'UpdatedFirst', email: 'updated@example.com' };
    const response = await request.put(`user/${user.username}`, { data: updated });

    expect(response.status()).toBe(200);
  });

  test('DELETE /user/{username} - deletes a user', async ({ request }) => {
    const user = buildUser();
    await request.post('user', { data: user });

    const response = await request.delete(`user/${user.username}`);

    expect(response.status()).toBe(200);
  });

  test('GET /user/{username} - returns 404 for non-existent user', async ({ request }) => {
    const response = await request.get('user/no_such_user_xyz_abc_999');

    expect(response.status()).toBe(404);
  });

  test('GET /user/login - authenticates with valid credentials', async ({ request }) => {
    const user = buildUser();
    await request.post('user', { data: user });

    const response = await request.get('user/login', {
      params: { username: user.username, password: user.password },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.code).toBe(200);
  });

  test('GET /user/logout - ends current session', async ({ request }) => {
    const response = await request.get('user/logout');

    expect(response.status()).toBe(200);
  });

  test.skip('POST /user/createWithArray - TODO: Creates list of users with given input array', async ({ request }) => {
    const payload = buildUser();
    const response = await request.post('user/createWithArray', { data: payload });

    expect(response.status()).toBe(200);
    const body: User = await response.json();
    // TODO: add assertions for body
  });
});
