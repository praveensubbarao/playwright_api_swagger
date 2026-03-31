# Contributing

Thank you for considering a contribution. This document covers everything you need to get started.

## Ground rules

- One concern per pull request — tests, a new API integration, a bug fix, or a docs update, not all at once.
- All tests must pass before opening a PR: `npm test`
- New API integrations must pass `npm run sync:check` with zero gaps.
- Follow the conventions in [CURSOR.md](CURSOR.md) — they are enforced by the Cursor rules in `.cursor/rules/`.

## Development setup

```bash
git clone https://github.com/praveensubbarao/playwright_api_swagger.git
cd playwright_api_swagger
npm install
npx playwright install
```

Run the existing test suite to confirm your environment is working:

```bash
npm test
```

## Project layout

See the [Structure section in README.md](README.md#structure). The short version:

- Each API lives under `apis/<name>/` — fully isolated, self-contained.
- Tests, types, and factories all live inside `apis/<name>/tests/`.
- Scripts that operate across APIs live in `scripts/`.

## Adding a new API

1. Create `apis/<name>/api.config.json` with `swaggerUri`, `baseUrl`, `specFile`, and `mcpPort`.
2. Run `npm run sync -- --api <name>` to generate test stubs from the spec.
3. Add a project block to `playwright.config.ts` (the commented template is already there).
4. Add convenience scripts to `package.json`: `test:<name>` and `sync:<name>`.
5. Implement the generated `test.skip` stubs — remove `test.skip`, add meaningful assertions.
6. Run `npm run sync:check` to confirm zero coverage gaps.
7. Update the `## Structure` block in `README.md` (the `readme-structure` Cursor rule will remind you).

## Writing tests

- Use factory functions from `apis/<name>/tests/fixtures/factories.ts` — never hardcode payloads.
- Import types from `apis/<name>/tests/types/`.
- Name tests as `'METHOD /path - description'` — the sync script uses this for coverage detection.
- Cover: happy path, 404 for missing resources, full CRUD lifecycle.
- See [.cursor/rules/api-testing.mdc](.cursor/rules/api-testing.mdc) for the full conventions.

## Adding a factory or type

- Add new TypeScript interfaces to `apis/<name>/tests/types/<name>.ts`.
- Add new `build*()` functions to `apis/<name>/tests/fixtures/factories.ts`.
- Use `faker.number.int()` (not deprecated `faker.datatype.number()`).
- Add overrides support: `export function buildFoo(overrides: Partial<Foo> = {}): Foo`.

## Modifying scripts

- `scripts/sync-tests.ts` — reads `apis/<name>/api.config.json` via `--api <name>`. Add new flags at the top CLI section.
- `scripts/start-mcp.ts` — same pattern. Config is driven entirely by `api.config.json`.
- Both scripts are ES modules — use `import`, not `require`.

## Before opening a PR

```bash
npm test                   # all tests pass
npm run sync:check         # zero coverage gaps
```

Check that `README.md`'s `## Structure` block matches the actual file tree. The `readme-structure` Cursor rule enforces this during development, but verify it manually before submitting.

## Reporting a bug

Open an issue at [github.com/praveensubbarao/playwright_api_swagger/issues](https://github.com/praveensubbarao/playwright_api_swagger/issues) with:

- What you ran (exact command)
- What you expected
- What actually happened (output / error message)
- Node.js version (`node --version`) and OS

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
