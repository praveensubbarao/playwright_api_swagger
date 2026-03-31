# Cursor Rules — Project Reference

This file is the project-level index for all Cursor rules in `.cursor/rules/`. Cursor loads this file as persistent context, so every rule listed here is active for the lifetime of any session in this project.

## Active Rules

| Rule file | Triggers on | Always active | Purpose |
|---|---|---|---|
| [readme-structure.mdc](.cursor/rules/readme-structure.mdc) | `tests/**`, `scripts/**`, `mcp/**`, `.cursor/rules/**` | **Yes** | Keeps `## Structure` in README.md in sync when any file is added, moved, or deleted |
| [api-testing.mdc](.cursor/rules/api-testing.mdc) | `tests/**/*.spec.ts` | No | Factories, type annotations, assertion style, test isolation, naming convention, lifecycle patterns |
| [playwright-api.mdc](.cursor/rules/playwright-api.mdc) | `tests/**/*.ts`, `playwright.config.ts` | No | baseURL + path convention (no leading `/`), request fixture usage, reporters, CI env vars |
| [swagger-review.mdc](.cursor/rules/swagger-review.mdc) | `mcp/**/*.json`, `**/*.openapi.json` | No | Spec completeness checklist, mapping operations to test coverage, spotting schema/reality gaps |

---

## Rule Summaries

### readme-structure — always active

Whenever a file or folder is created, renamed, moved, or deleted under `tests/`, `scripts/`, `mcp/`, or `.cursor/rules/`, update the fenced tree block under `## Structure` in `README.md` in the same response. Every entry gets a short `# comment` describing what it does. Never include gitignored paths (`node_modules/`, `dist/`, `test-results/`, etc.).

### api-testing

Use `buildUser()` / `buildPet()` / `buildOrder()` from `tests/fixtures/factories.ts` — never inline literals. Import types from `tests/types/petstore.ts`. Assert exact status codes. Cover: happy path, 404, full CRUD lifecycle. Name tests `'METHOD /path - description'` — the sync script keys on this for coverage detection.

### playwright-api

`baseURL` ends with `/` — all request paths must be **relative** (no leading slash). `request.get('pet/findByStatus')` not `request.get('/pet/findByStatus')`. Use the `request` fixture directly — no wrapper needed. Run `npm run report` to open the HTML report after failures.

### swagger-review

When reading `mcp/swagger.json` or any OpenAPI spec: verify every operation has documented error codes, required fields are explicit, enum values are exhaustive, and auth requirements are stated. Map each undocumented error to a test case. Keep `tests/types/petstore.ts` in sync with schema changes.

---

## Adding a New Rule

1. Create `.cursor/rules/<name>.mdc` with frontmatter:

```markdown
---
description: One-line description of what this rule enforces
globs:
  - "path/to/files/**"
alwaysApply: false
---
```

2. Add a row to the **Active Rules** table above.
3. Add a short summary paragraph under **Rule Summaries**.
4. The `readme-structure` rule will prompt you to update `README.md` too — do it.

---

## Key Conventions (quick reference)

```
api layout     apis/<name>/api.config.json        ← swagger URI, baseURL, port
               apis/<name>/tests/                 ← tests, fixtures, types
               apis/<name>/mcp/                   ← spec files
baseURL        trailing slash required (e.g. https://petstore.swagger.io/v2/)
request paths  'pet/findByStatus'                 ← no leading slash
env var        PETSTORE_BASE_URL=https://...       ← <NAME>_BASE_URL per project
test names     'GET /pet/{petId} - description'   ← METHOD + path + dash
factories      buildUser() / buildPet() / buildOrder()
types          apis/<name>/tests/types/<name>.ts
sync command   npm run sync -- --api petstore      ← writes stubs for new ops
CI check       npm run sync:check                  ← exits 1 if gaps exist
MCP client     claude mcp add petstore-api --url http://localhost:8080
new API        create apis/<name>/api.config.json + add project to playwright.config.ts
```
