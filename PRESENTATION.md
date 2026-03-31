# Playwright API Framework + Swagger MCP
### Schema-Driven API Testing at Scale

---

## Slide 0 — How This Stands Apart

Most API test frameworks make you do three things manually every time the API changes: read the spec diff, figure out what's untested, write new scaffolding. This framework eliminates all three steps.

### Framework comparison

| Capability | **This framework** | Postman / Newman | RestAssured | Supertest |
|---|---|---|---|---|
| Language | TypeScript | JSON / JS | Java | Node.js |
| Spec-to-test sync | `npm run sync --api <name>` auto-generates stubs | Manual collection import | Manual | Manual |
| Spec drift detection | Diffs spec hash every run, reports new/removed ops | None | None | None |
| AI-queryable API | MCP server — tools callable from Claude Code | No | No | No |
| Fake data | Faker factories with TypeScript types | Faker (no types) | Java Faker | Manual |
| Per-operation coverage table | Built in to `sync:check` | None | None | None |
| Multi-API isolation | One `apis/<name>/` folder per swagger URI | One collection | One project | Manual |
| Environment switching | `<NAME>_BASE_URL` env var per project | Environment files | System properties | Manual |
| TypeScript types | Interfaces mirror OpenAPI schemas exactly | None | None | None |
| CI gate for coverage | `npm run sync:check` exits non-zero on gaps | None | None | None |

### The core loop

```
Point at a Swagger URI
      │
      ▼
npm run sync -- --api <name>   ← diffs spec, writes test.skip stubs for all ops
      │
      ▼
Implement stubs                ← remove test.skip, add assertions
      │
      ▼
npm test                       ← 22+ tests, ~2 seconds, HTML report
      │
      ▼
npm run sync:check             ← CI gate: fails if any op has no coverage
```

No manual scaffolding. No drift. Works for any swagger URI.

### Why Claude Code as the MCP client

Every other workflow (Postman, curl, Insomnia) requires you to context-switch between the API tool and the test editor. With Claude Code connected to the MCP server you stay in one place:

- Call live API operations directly from the terminal
- Ask Claude to review the swagger spec for gaps
- Ask Claude to implement the generated stubs following the project's conventions
- The test runner, the spec, and the AI assistant share the same context

---

## Slide 1 — The Stack at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                      Developer / AI Agent                   │
└──────────┬────────────────────────┬────────────────────────-┘
           │ npm run mcp:start      │ npm run sync -- --api petstore
           ▼                        ▼
┌──────────────────────┐  ┌──────────────────────────────────┐
│  Swagger MCP Server  │  │  sync-tests.ts                   │
│  localhost:8080      │  │  · reads api.config.json         │
│  (api-to-mcp, Tyk)   │  │  · diffs spec vs manifest        │
└──────────┬───────────┘  │  · scans test coverage           │
           │ proxies to   │  · writes test.skip stubs        │
           │              └──────────┬───────────────────────┘
           │                         │ reads / writes
           │              ┌──────────▼───────────────────────┐
           │              │  apis/petstore/                   │
           │              │  ├── api.config.json              │
           │              │  ├── mcp/swagger.json  (spec)     │
           │              │  ├── .spec-manifest.json (state)  │
           │              │  └── tests/api/*.spec.ts          │
           │              └──────────────────────────────────┘
           ▼                         ▲
┌──────────────────────┐             │ HTTP requests
│  Target REST API     │─────────────┘
│  petstore.swagger.io │  ← npm test (Playwright)
└──────────────────────┘
```

**Key packages:** `@playwright/test` · `@faker-js/faker` · `@tyk-technologies/api-to-mcp`

---

## Slide 2 — What is the Swagger MCP Server?

**MCP = Model Context Protocol** — a standard for exposing tools to AI agents and developer tooling.

The MCP server converts every OpenAPI operation into a callable **tool**, making the API schema queryable and executable by AI assistants (Claude, Cursor, etc).

### How it is configured — `scripts/start-mcp.ts`

The script reads `apis/<name>/api.config.json` — no hardcoded URLs anywhere:

```json
// apis/petstore/api.config.json
{
  "name": "petstore",
  "swaggerUri": "https://petstore3.swagger.io/api/v3/openapi.json",
  "baseUrl": "https://petstore.swagger.io/v2/",
  "specFile": "mcp/swagger.json",
  "mcpPort": 8080
}
```

```
Step 1: Download spec
  GET  swaggerUri  →  apis/petstore/mcp/openapi.json

Step 2: Spawn api-to-mcp
  npx api-to-mcp
    --spec      apis/petstore/mcp/openapi.json
    --port      8080
    --targetUrl https://petstore.swagger.io/v2
```

**Swap `api.config.json` → get a completely different MCP server. No script changes.**

### What gets exposed (19 tools from the Petstore spec)

| Tag   | Tools generated |
|-------|----------------|
| pet   | addPet · updatePet · getPetById · findPetsByStatus · findPetsByTags · updatePetWithForm · deletePet · uploadFile |
| store | getInventory · placeOrder · getOrderById · deleteOrder |
| user  | createUser · createUsersWithListInput · loginUser · logoutUser · getUserByName · updateUser · deleteUser |

### To start it

```bash
npm run mcp:start          # starts petstore MCP on :8080
npm run mcp:start -- --api my-other-api   # starts a different API's MCP
```

### Claude Code — primary MCP client

Claude Code is the first-class MCP client for this framework. Register the server in one command:

```bash
claude mcp add petstore-api --url http://localhost:8080
```

**Workflow with Claude Code:**

```
1. npm run mcp:start              → MCP server live on :8080
2. claude mcp add petstore-api …  → tools registered in Claude Code
3. Ask Claude: "call getPetById with id 1"            → live API call, typed response
4. Ask Claude: "review apis/petstore/mcp/swagger.json for missing error responses"
5. npm run sync                    → stubs written for uncovered ops
6. Ask Claude: "implement the test.skip stubs in pet.spec.ts"
```

Other MCP-compatible clients (Cursor, VS Code MCP extension) also connect to `http://localhost:8080`.

---

## Slide 3 — Playwright API Framework Overview

### Project layout

```
apis/
└── petstore/                   ← SWAGGER_URI_1 (add apis/<name>/ for each new API)
    ├── api.config.json          ← swagger URI, baseURL, spec path, MCP port
    ├── mcp/
    │   └── swagger.json         ← Swagger 2.0 reference spec
    ├── tests/
    │   ├── types/
    │   │   └── petstore.ts      ← TypeScript interfaces (User, Pet, Order …)
    │   ├── fixtures/
    │   │   └── factories.ts     ← Faker-powered payload builders
    │   └── api/
    │       ├── user.spec.ts     ← 8 tests (CRUD + login/logout + 404) + stubs
    │       ├── pet.spec.ts      ← 8 tests (CRUD + findByStatus + lifecycle) + stubs
    │       └── store.spec.ts    ← 6 tests (inventory + order lifecycle)
    └── .spec-manifest.json      ← last sync state (gitignored)
scripts/
├── start-mcp.ts                 ← reads api.config.json → starts MCP server
└── sync-tests.ts                ← diffs spec, scans coverage, writes stubs
.cursor/rules/
├── readme-structure.mdc         ← always active: keeps README structure in sync
├── api-testing.mdc              ← factories, types, assertions, naming, lifecycle
├── playwright-api.mdc           ← baseURL/path convention, fixtures, reporters
└── swagger-review.mdc           ← spec completeness checklist, coverage mapping
CURSOR.md                        ← project-level rule index + quick-reference
```

**22 active tests · 4 stubs (test.skip) · 3 domains · ~2 seconds total**

### Key design decisions

| Decision | Why |
|----------|-----|
| `apis/<name>/` isolation | Each swagger URI is fully self-contained — types, tests, spec, config |
| `baseURL` ends with `/`, paths have **no** leading `/` | URL constructor: `/pet` drops the `/v2` base path |
| `<NAME>_BASE_URL` env var per project | Point any project at staging/prod without touching config files |
| Factory functions, not inline literals | Single place to update when schema changes |
| TypeScript interfaces mirror the OpenAPI schemas | Catch shape mismatches at compile time |
| HTML reporter + list reporter | Clean CI output + browsable report on demand |
| `retries: 2` in CI, `0` locally | Absorb transient network flakes without hiding real failures |

### Running tests

```bash
npm test                                    # all projects
npm run test:petstore                       # petstore project only
npm run test:user                           # user spec only
npm run test:pet                            # pet spec only
npm run test:store                          # store spec only
npm run report                              # open HTML report
npx playwright test --last-failed           # re-run only what failed
PETSTORE_BASE_URL=https://staging.io/v2/ npm test   # target staging
```

### Keeping tests in sync with the spec

```bash
npm run sync              # scan petstore spec → write stubs for uncovered ops
npm run sync:check        # report gaps only, no file writes (CI-safe)
npm run sync:download     # fetch latest OpenAPI 3 spec first, then sync
npm run sync -- --api my-other-api   # sync a different API project
```

---

## Slide 4 — A Test, Annotated

```typescript
// apis/petstore/tests/api/pet.spec.ts

import { test, expect } from '@playwright/test';
import { buildPet } from '../fixtures/factories';   // ← Faker factory
import type { Pet } from '../types/petstore';        // ← typed response

test('POST /pet - full lifecycle: create, read, update, delete',
  async ({ request }) => {                          // ← built-in request fixture
                                                    //   baseURL from playwright.config.ts project

  // 1. CREATE — unique ID prevents collision with other parallel tests
  const pet = buildPet({ status: 'available' });
  const createRes = await request.post('pet', { data: pet });  // ← no leading /
  expect(createRes.status()).toBe(200);
  const created: Pet = await createRes.json();

  // 2. READ
  const getRes = await request.get(`pet/${created.id}`);
  expect(getRes.status()).toBe(200);

  // 3. UPDATE
  const updateRes = await request.put('pet', {
    data: { ...created, status: 'sold' },
  });
  const updated: Pet = await updateRes.json();
  expect(updated.status).toBe('sold');             // ← exact field assertion

  // 4. DELETE + confirm
  await request.delete(`pet/${created.id}`);
  const afterDelete = await request.get(`pet/${created.id}`);
  expect(afterDelete.status()).toBe(404);           // ← prove it's gone
});
```

---

## Slide 5 — Spec-Driven Test Sync (`sync-tests.ts`)

The sync command closes the gap between the API spec and the test suite automatically.

### How it works

```
npm run sync -- --api petstore
     │
     ├─ 1. Read  apis/petstore/api.config.json
     │       → locate spec:  apis/petstore/mcp/swagger.json
     │       → supports Swagger 2.0 and OpenAPI 3.x
     │
     ├─ 2. Diff against  apis/petstore/.spec-manifest.json  (last run state)
     │       → report NEW operations   (+)
     │       → report REMOVED operations  (-)  ← manual cleanup needed
     │
     ├─ 3. Scan  apis/petstore/tests/api/*.spec.ts  for coverage
     │       → match test names to  "METHOD /path -"  convention
     │       → fallback: search for path string in request() calls
     │
     ├─ 4. For each uncovered operation → append test.skip stub
     │       → to existing spec file  (pet → pet.spec.ts)
     │       → or create a new spec file  (new tag → newtag.spec.ts)
     │
     └─ 5. Update  apis/petstore/.spec-manifest.json  ← next diff baseline
```

### Output example

```
✓  Spec unchanged (hash bb116730d391e330)

Coverage
  19 covered  /  20 total operations
⚠  1 operation(s) have no test coverage:
  ⚠  POST    /pet/{petId}/uploadImage   uploadFile

  pet
    ⚠ POST    /pet/{petId}/uploadImage
    ✓ DELETE  /pet/{petId}
    ✓ GET     /pet/findByStatus
    ...

→ Writing test stubs for 1 uncovered operation(s)...
✓ Appended 1 stub(s) → apis/petstore/tests/api/pet.spec.ts

Note: New stubs use test.skip — implement them and remove the skip.
```

### Generated stub (ready to implement)

```typescript
  test.skip('POST /pet/{petId}/uploadImage - TODO: uploads an image',
    async ({ request }) => {

    // TODO: create or obtain a real ID
    const petId = TODO_PETID;
    const payload = {}; // TODO: build payload

    const response = await request.post(`pet/${petId}/uploadImage`, { data: payload });

    expect(response.status()).toBe(200);
    const body: Pet = await response.json();
    // TODO: add assertions for body
  });
```

### CI integration

```yaml
- name: Check for untested API operations
  run: npm run sync:check
  # Exits non-zero if any op in apis/petstore/mcp/swagger.json has no test coverage
```

---

## Slide 6 — What Stays Manual

Auto-generation gets you a running skeleton. Three things will always need a human:

| What | Why |
|---|---|
| Meaningful assertions beyond status codes | The spec doesn't describe business logic |
| Dependent operations (create before delete) | Ordering is implicit, not declared in the spec |
| Error-case tests with specific invalid payloads | Requires domain knowledge of what "invalid" means |

The `test.skip` stubs make this explicit — every generated stub is a clear TODO with the right scaffolding already in place:

```typescript
  test.skip('POST /store/order - TODO: Place an order for a pet',
    async ({ request }) => {

    const payload = buildOrder(TODO_PET_ID);           // ← factory is ready

    const response = await request.post('store/order', { data: payload });

    expect(response.status()).toBe(200);
    const body: Order = await response.json();
    // TODO: add assertions for body                   ← human fills this in
  });
```

**The human's job is narrowly scoped** — the file exists, the imports are correct, the factory call is there, the status assertion is there. The only thing left is the domain-specific "what should the response actually contain?" question that no spec can answer.

### What auto-generation intentionally does NOT attempt

- **Business rule validation** — e.g. "an order for a sold pet should return 400" requires knowing the rule
- **State-dependent sequences** — e.g. login → get token → use token must be written as a fixture
- **Negative path payloads** — e.g. missing required field, wrong type, boundary values
- **Response field semantics** — e.g. `shipDate` should be in the future, not just any date-time string

These are left as `// TODO` comments inside the stubs so nothing is silently skipped.

---

## Slide 7 — How It Scales

### Scale 1 — New endpoint in an existing API (< 2 minutes)

When an endpoint is added to the spec, `sync` detects it and scaffolds the test:

```bash
npm run sync          # detects new op, writes test.skip stub to the right spec file
# → Open the stub, remove test.skip, add assertions
npm test              # new test runs green
```

---

### Scale 2 — New API domain within an existing project (< 5 minutes)

Adding a new resource tag (e.g. `payments`) to an existing API follows a 3-step pattern:

```
1.  Add interface       apis/petstore/tests/types/petstore.ts
      export interface Payment { id: number; amount: number; currency: string; }

2.  Add factory         apis/petstore/tests/fixtures/factories.ts
      export function buildPayment(overrides = {}) {
        return { id: faker.number.int({ min: 10_000, max: 99_999 }),
                 amount: faker.number.float({ min: 1, max: 500, fractionDigits: 2 }),
                 currency: faker.finance.currencyCode(), ...overrides };
      }

3.  Run sync            npm run sync
      → stubs generated in apis/petstore/tests/api/payment.spec.ts automatically
```

---

### Scale 3 — Entire new API (SWAGGER_URI_2)

Point the framework at any new swagger URI:

```bash
# 1. Create the API folder + config
mkdir -p apis/my-other-api/mcp
cat > apis/my-other-api/api.config.json << 'EOF'
{
  "name": "my-other-api",
  "swaggerUri": "https://my-other-api.example.com/openapi.json",
  "baseUrl": "https://my-other-api.example.com/v1/",
  "specFile": "mcp/openapi.json",
  "mcpPort": 8081
}
EOF

# 2. Generate all test stubs from the spec
npm run sync -- --api my-other-api

# 3. Uncomment the project block in playwright.config.ts (template already there)

# 4. Run the new project's tests (all skip until implemented)
npx playwright test --project=my-other-api
```

Each API is fully isolated — different folder, different port, different env var (`MY_OTHER_API_BASE_URL`).

---

### Scale 4 — Multiple environments

```bash
# Dev
PETSTORE_BASE_URL=http://localhost:3000/ npm test

# Staging
PETSTORE_BASE_URL=https://staging.petstore.io/v2/ npm test

# Multiple APIs, each on their own env
PETSTORE_BASE_URL=https://staging.petstore.io/v2/ \
MY_OTHER_API_BASE_URL=https://staging.other.example.com/v1/ \
npm test
```

`playwright.config.ts` uses one `<NAME>_BASE_URL` env var per project. No test file changes needed.

---

### Scale 5 — Authenticated APIs

Add an `auth.fixture.ts` inside the API's fixtures folder that logs in once per test run and shares the token:

```typescript
// apis/my-other-api/tests/fixtures/auth.fixture.ts
import { test as base } from '@playwright/test';

export const test = base.extend<{ authToken: string }>({
  authToken: async ({ request }, use) => {
    const res = await request.get('auth/login', {
      params: { username: 'admin', password: process.env.API_PASSWORD },
    });
    const { token } = await res.json();
    await use(token);
  },
});

// apis/my-other-api/tests/api/protected.spec.ts
import { test } from '../fixtures/auth.fixture';

test('GET /admin/report - requires auth', async ({ request, authToken }) => {
  const res = await request.get('admin/report', {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  expect(res.status()).toBe(200);
});
```

---

### Scale 6 — CI pipeline with multiple API projects

```yaml
# .github/workflows/api-tests.yml
- name: Run all API tests
  run: npm test
  env:
    CI: true
    PETSTORE_BASE_URL: ${{ secrets.PETSTORE_STAGING_URL }}
    MY_OTHER_API_BASE_URL: ${{ secrets.OTHER_API_STAGING_URL }}

- name: Check spec coverage (all APIs)
  run: |
    npm run sync:check
    npm run sync -- --api my-other-api --check

- name: Upload HTML report
  uses: actions/upload-artifact@v4
  with:
    name: playwright-report
    path: playwright-report/
```

---

## Summary

| Capability | How |
|---|---|
| Schema source of truth | `apis/<name>/mcp/swagger.json` — per-API reference spec |
| API project config | `apis/<name>/api.config.json` — URI, baseURL, port, spec path |
| Primary MCP client | **Claude Code** — `claude mcp add petstore-api --url http://localhost:8080` |
| AI-queryable API tools | MCP server per API, reads `api.config.json` via `--api` flag |
| Type-safe test payloads | `apis/<name>/tests/types/` mirrors OpenAPI schemas |
| Realistic fake data | `@faker-js/faker` factories in `apis/<name>/tests/fixtures/` |
| Spec drift detection | `npm run sync:check --api <name>` per project |
| Auto stub generation | `npm run sync --api <name>` writes `test.skip` stubs |
| Multi-API isolation | One `apis/<name>/` folder per swagger URI, zero shared state |
| AI coding conventions | 4 Cursor rules in `.cursor/rules/` + `CURSOR.md` project index |
| Self-updating docs | `readme-structure.mdc` (always active) keeps README tree in sync |
| Environment switching | `<NAME>_BASE_URL` env var, zero test file changes |
| CI-ready | Retries, workers, HTML artifact, per-project `sync:check` gate |
