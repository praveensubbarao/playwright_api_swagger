# Playwright API Swagger Framework

Playwright API test suite for the [Petstore API](https://petstore.swagger.io/v2) with MCP (Model Context Protocol) integration for schema-driven workflows.

> **Claude Code users:** This repo ships a local MCP server. Add it to Claude Code and you can browse, call, and generate tests for every API operation directly from your terminal — no browser needed. See [Claude Code MCP setup](#claude-code-mcp-setup) below.

## What Makes This Different

Most API test frameworks make you do three things manually every time the API changes: read the diff, figure out what's untested, and write new test scaffolding. This framework eliminates all three:

| Capability | This framework | Postman / Newman | RestAssured | Supertest |
|---|---|---|---|---|
| Language | TypeScript | JSON/JS | Java | Node.js |
| Spec-to-test sync | `npm run sync` auto-generates stubs | Manual collection import | Manual | Manual |
| Drift detection | Diffs spec hash on every run | None | None | None |
| AI-queryable API | MCP server exposes all ops as tools | No | No | No |
| Fake data | Faker factories with type safety | Faker (no types) | Java Faker | Manual |
| Test coverage report | Per-operation coverage table | None built-in | None built-in | None |
| Multi-API isolation | One `apis/<name>/` folder per swagger URI | One collection per API | One project per API | Manual |
| Environment switching | `<NAME>_BASE_URL` env var per project | Environment files | System properties | Manual |
| TypeScript types | Mirror OpenAPI schemas | None | None | None |

The core loop is: **spec changes → `npm run sync` → stubs appear → implement and remove `test.skip`**. No manual scaffolding, no drift.

## Structure

```
apis/
└── petstore/                  # SWAGGER_URI_1 — add apis/<name>/ for each new API
    ├── api.config.json        # swagger URI, baseURL, spec path, MCP port
    ├── mcp/
    │   └── swagger.json       # Swagger 2.0 reference spec
    ├── tests/
    │   ├── api/
    │   │   ├── user.spec.ts   # User CRUD + auth endpoints
    │   │   ├── pet.spec.ts    # Pet CRUD + findByStatus endpoints
    │   │   └── store.spec.ts  # Store inventory + order lifecycle
    │   ├── fixtures/
    │   │   └── factories.ts   # Faker-based payload builders
    │   └── types/
    │       └── petstore.ts    # TypeScript interfaces for API payloads
    └── .spec-manifest.json    # Last sync state (gitignored)
scripts/
├── start-mcp.ts               # Reads api.config.json, starts MCP server
└── sync-tests.ts              # Diffs spec, scans coverage, writes stubs
.cursor/rules/
├── readme-structure.mdc       # Keeps this structure block in sync (always active)
├── api-testing.mdc            # Test conventions: factories, types, assertions, naming
├── playwright-api.mdc         # Playwright patterns: baseURL, request fixture, reporters
└── swagger-review.mdc         # Spec review checklist and coverage mapping
CURSOR.md                      # Project-level Cursor rule index and quick-reference
```

## Setup

```bash
npm install
npx playwright install
```

## Running Tests

```bash
npm test                    # all projects
npm run test:petstore       # petstore project only
npm run test:user           # user spec only
npm run test:pet            # pet spec only
npm run test:store          # store spec only
npm run report              # open HTML report
```

Override the base URL per project (env var is `<PROJECT_NAME>_BASE_URL`):

```bash
PETSTORE_BASE_URL=https://staging.petstore.io/v2/ npm test
```

## Syncing Tests with the Spec

`sync-tests.ts` reads the Swagger spec, diffs it against a stored manifest, scans test files for coverage, and writes `test.skip` stubs for any operation that has no test.

```bash
npm run sync              # scan + write stubs for uncovered operations
npm run sync:check        # report only — no file writes (good for CI)
npm run sync:download     # fetch latest OpenAPI 3 spec first, then sync
```

What it does on each run:
1. Reads `apis/<name>/api.config.json` to locate the spec (`apis/<name>/mcp/swagger.json`)
2. Diffs operations against `apis/<name>/.spec-manifest.json` — reports added/removed endpoints
3. Scans `apis/<name>/tests/api/*.spec.ts` for coverage by matching test names to `METHOD /path`
4. Appends `test.skip` stubs to the relevant spec file for any uncovered operation
5. Updates `apis/<name>/.spec-manifest.json` with the current spec state

Run `npm run sync:check` in CI to catch spec drift before it reaches production.

## Claude Code MCP Setup

Claude Code is the primary MCP-compatible client for this framework. Once the MCP server is running, Claude Code can call any API operation as a tool, read response schemas, and help write or review tests — all from the terminal.

**1. Start the MCP server**

```bash
npm run mcp:start
# Downloads latest OpenAPI spec → starts MCP server on http://localhost:8080
```

**2. Register it with Claude Code**

```bash
claude mcp add petstore-api --url http://localhost:8080
```

**3. Verify tools are available**

```bash
claude mcp list
# petstore-api   http://localhost:8080   19 tools
```

**What you can do from Claude Code once connected:**

- Ask Claude to call `getPetById`, `placeOrder`, or any of the 19 operations directly
- Ask Claude to review `apis/petstore/mcp/swagger.json` for schema gaps or missing error responses
- Ask Claude to generate a test for a specific `operationId` using the project's factories and conventions
- Run `npm run sync` and ask Claude to implement the generated `test.skip` stubs

Other MCP-compatible clients (Cursor, VS Code with MCP extension) can also point at `http://localhost:8080`.

## Adding a New API

Each API lives in its own folder under `apis/`. To add a second API:

**1. Create the folder and config**

```bash
mkdir -p apis/my-other-api/mcp
```

```json
// apis/my-other-api/api.config.json
{
  "name": "my-other-api",
  "swaggerUri": "https://my-other-api.example.com/openapi.json",
  "baseUrl": "https://my-other-api.example.com/v1/",
  "specFile": "mcp/openapi.json",
  "mcpPort": 8081
}
```

**2. Add a Playwright project** in [playwright.config.ts](playwright.config.ts) — the commented block is already there, just uncomment and fill in.

**3. Generate stubs**

```bash
npm run sync -- --api my-other-api
```

**4. Add per-project scripts** to `package.json`:

```json
"test:my-other-api": "npx playwright test --project=my-other-api",
"sync:my-other-api": "ts-node ./scripts/sync-tests.ts --api my-other-api"
```

**5. Start that API's MCP server**

```bash
ts-node ./scripts/start-mcp.ts --api my-other-api
claude mcp add my-other-api --url http://localhost:8081
```

## Writing Tests

Key conventions (apply to every API under `apis/`):
- Use factory functions from `apis/<name>/tests/fixtures/factories.ts` — never inline literals.
- Import types from `apis/<name>/tests/types/<name>.ts`.
- Name tests as `'METHOD /path - description'` — the sync script keys on this for coverage detection.
- Always create resources with a Faker-generated `id` to avoid collisions in shared test environments.
- Test: happy path, 404 for missing resources, full CRUD lifecycle.
