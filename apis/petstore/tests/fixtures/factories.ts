import { faker } from '@faker-js/faker';
import type { User, Pet, Order } from '../types/petstore';

export function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: faker.number.int({ min: 10_000, max: 99_999 }),
    username: faker.internet.userName(),
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    email: faker.internet.email(),
    password: faker.internet.password({ length: 12 }),
    phone: faker.phone.number(),
    userStatus: 1,
    ...overrides,
  };
}

export function buildPet(overrides: Partial<Pet> = {}): Pet {
  return {
    id: faker.number.int({ min: 10_000, max: 99_999 }),
    name: faker.animal.cat(),
    category: { id: 1, name: 'Cats' },
    photoUrls: ['https://example.com/photo.jpg'],
    tags: [{ id: 1, name: faker.word.adjective() }],
    status: 'available',
    ...overrides,
  };
}

export function buildOrder(petId: number, overrides: Partial<Order> = {}): Order {
  return {
    id: faker.number.int({ min: 10_000, max: 99_999 }),
    petId,
    quantity: faker.number.int({ min: 1, max: 5 }),
    shipDate: new Date(Date.now() + 86_400_000).toISOString(),
    status: 'placed',
    complete: false,
    ...overrides,
  };
}
