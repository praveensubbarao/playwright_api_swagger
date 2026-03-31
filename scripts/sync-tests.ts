/**
 * sync-tests.ts
 *
 * Scans the spec for an API project under apis/<name>/ for changes since the
 * last run, checks which operations have test coverage, and writes test stubs
 * for any that are missing.
 *
 * Usage:
 *   npm run sync                        scan default API (petstore), write stubs
 *   npm run sync -- --api petstore      explicit API name
 *   npm run sync -- --api my-other-api  scan a different API project
 *   npm run sync -- --check             report only — no file writes
 *   npm run sync -- --download          fetch latest spec first, then sync
 *   npm run sync -- --spec <path>       override spec file path
 *
 * Each API project lives at:
 *   apis/<name>/
 *   ├── api.config.json   ← swaggerUri, baseUrl, specFile, mcpPort
 *   ├── mcp/swagger.json  ← spec used for sync
 *   ├── tests/api/        ← scanned for coverage
 *   └── .spec-manifest.json  ← state from last sync run
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── paths ──────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');

// ─── CLI flags ───────────────────────────────────────────────────────────────

const args     = process.argv.slice(2);
const CHECK    = args.includes('--check');
const DOWNLOAD = args.includes('--download');

const apiFlag  = args.indexOf('--api');
const API_NAME = apiFlag !== -1 ? args[apiFlag + 1] : 'petstore';
const API_DIR  = resolve(ROOT, 'apis', API_NAME);

// Per-API paths — all derived from apis/<name>/
const TESTS_DIR  = resolve(API_DIR, 'tests/api');
const MANIFEST   = resolve(API_DIR, '.spec-manifest.json');
const OPENAPI_PATH = resolve(API_DIR, 'mcp/openapi.json');

// Load api.config.json so we know where the spec lives and the download URL
interface ApiConfig {
  name: string;
  swaggerUri: string;
  baseUrl: string;
  specFile: string;
  mcpPort: number;
}
let apiConfig: ApiConfig = {
  name: API_NAME,
  swaggerUri: '',
  baseUrl: '',
  specFile: 'mcp/swagger.json',
  mcpPort: 8080,
};
const configPath = resolve(API_DIR, 'api.config.json');
if (existsSync(configPath)) {
  apiConfig = JSON.parse(await readFile(configPath, 'utf-8')) as ApiConfig;
}

const specFlag  = args.indexOf('--spec');
const SPEC_PATH = specFlag !== -1
  ? resolve(ROOT, args[specFlag + 1])
  : resolve(API_DIR, apiConfig.specFile);

const OPENAPI_URL = apiConfig.swaggerUri || 'https://petstore3.swagger.io/api/v3/openapi.json';

// ─── types ──────────────────────────────────────────────────────────────────

interface Operation {
  method: string;       // 'get' | 'post' | 'put' | 'delete'
  path: string;         // '/pet/{petId}'
  operationId: string;  // 'getPetById'
  tag: string;          // 'pet'
  summary: string;      // 'Find pet by ID'
  hasBody: boolean;
  pathParams: string[];
  queryParams: string[];
  successStatus: number;
}

interface Manifest {
  specHash: string;
  operations: Operation[];
  updatedAt: string;
}

// ─── colours ─────────────────────────────────────────────────────────────────

const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  grey:   '\x1b[90m',
};

function log(msg: string) { console.log(msg); }
function ok(msg: string)  { console.log(`${c.green}✓${c.reset} ${msg}`); }
function warn(msg: string){ console.log(`${c.yellow}⚠${c.reset}  ${msg}`); }
function err(msg: string) { console.log(`${c.red}✘${c.reset} ${msg}`); }
function info(msg: string){ console.log(`${c.cyan}→${c.reset} ${msg}`); }
function dim(msg: string) { console.log(`${c.grey}${msg}${c.reset}`); }

// ─── spec parsing ────────────────────────────────────────────────────────────

/**
 * Supports both Swagger 2.0 and OpenAPI 3.x (auto-detected from the spec).
 */
function parseOperations(spec: Record<string, unknown>): Operation[] {
  const ops: Operation[] = [];
  const isOAS3 = 'openapi' in spec;

  const paths = spec.paths as Record<string, Record<string, unknown>>;
  if (!paths) return ops;

  const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch'];

  for (const [path, methods] of Object.entries(paths)) {
    for (const method of HTTP_METHODS) {
      const op = methods[method] as Record<string, unknown> | undefined;
      if (!op) continue;

      const tags = (op.tags as string[] | undefined) ?? ['default'];
      const params = (op.parameters as Array<Record<string, unknown>> | undefined) ?? [];

      const pathParams  = params.filter(p => p['in'] === 'path').map(p => String(p['name']));
      const queryParams = params.filter(p => p['in'] === 'query').map(p => String(p['name']));

      // Detect whether the operation accepts a request body
      let hasBody = false;
      if (isOAS3) {
        hasBody = 'requestBody' in op;
      } else {
        hasBody = params.some(p => p['in'] === 'body' || p['in'] === 'formData');
      }

      // Determine the documented success status code
      const responses = (op.responses as Record<string, unknown> | undefined) ?? {};
      const successStatus = [200, 201, 204].find(s => String(s) in responses) ?? 200;

      ops.push({
        method,
        path,
        operationId: String(op.operationId ?? `${method}${path.replace(/\W/g, '_')}`),
        tag:         tags[0].toLowerCase(),
        summary:     String(op.summary ?? ''),
        hasBody,
        pathParams,
        queryParams,
        successStatus,
      });
    }
  }

  return ops.sort((a, b) => `${a.tag}${a.path}${a.method}`.localeCompare(`${b.tag}${b.path}${b.method}`));
}

function hashSpec(raw: string): string {
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

// ─── coverage detection ───────────────────────────────────────────────────────

/**
 * An operation is considered "covered" when any test file contains a test
 * whose name matches the convention:  METHOD /path - ...
 * e.g.  test('GET /pet/{petId} - retrieves a pet by ID', ...)
 *
 * We also check for the path string in request calls as a fallback, in case
 * the test was written without following the naming convention.
 */
async function loadTestCorpus(): Promise<string> {
  if (!existsSync(TESTS_DIR)) return '';

  const files = (await readdir(TESTS_DIR)).filter(f => f.endsWith('.spec.ts'));
  const contents = await Promise.all(
    files.map(f => readFile(resolve(TESTS_DIR, f), 'utf-8')),
  );
  return contents.join('\n');
}

function isCovered(op: Operation, corpus: string): boolean {
  const METHOD = op.method.toUpperCase();

  // 1. Naming-convention match — covers both test() and test.skip()
  //    test('GET /pet/{petId} -  OR  test.skip('GET /pet/{petId} -
  const titlePattern = new RegExp(
    `test(?:\\.skip)?\\(['"\`]${METHOD}\\s+${escapeRegex(op.path)}\\s*[-–]`,
    'i',
  );
  if (titlePattern.test(corpus)) return true;

  // 2. Fallback: bare path string in a request call
  //    request.get('pet/findByStatus')  or  request.get(`pet/${id}`)
  const normalPath = op.path.replace(/^\//, '');  // strip leading slash
  const staticPath = normalPath.replace(/\{[^}]+\}/g, '');  // e.g. 'pet/'

  const callPattern = new RegExp(
    `request\\.${op.method}\\s*\\(\\s*['"\`]${escapeRegex(staticPath)}`,
    'i',
  );
  return callPattern.test(corpus);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── stub generation ─────────────────────────────────────────────────────────

/**
 * Returns the test file path for a given tag, creating a new one if needed.
 */
function specFileFor(tag: string): string {
  return resolve(TESTS_DIR, `${tag}.spec.ts`);
}

function builderFor(tag: string): string | null {
  const map: Record<string, string> = {
    pet:   'buildPet',
    user:  'buildUser',
    store: 'buildOrder',
  };
  return map[tag] ?? null;
}

function typeFor(tag: string): string | null {
  const map: Record<string, string> = {
    pet:   'Pet',
    user:  'User',
    store: 'Order',
  };
  return map[tag] ?? null;
}

function generateStub(op: Operation): string {
  const METHOD   = op.method.toUpperCase();
  const normPath = op.path.replace(/^\//, '');
  const builder  = builderFor(op.tag);
  const typeName = typeFor(op.tag);

  // Build the request path expression
  let pathExpr: string;
  if (op.pathParams.length > 0) {
    // Replace {param} with ${param}
    let p = normPath;
    for (const param of op.pathParams) {
      p = p.replace(`{${param}}`, `\${${param}}`);
    }
    pathExpr = `\`${p}\``;
  } else {
    pathExpr = `'${normPath}'`;
  }

  // Setup block
  const setupLines: string[] = [];
  if (op.pathParams.length > 0) {
    setupLines.push(`    // TODO: create or obtain a real ID`);
    for (const param of op.pathParams) {
      setupLines.push(`    const ${param} = TODO_${param.toUpperCase()};`);
    }
  }
  if (op.hasBody && builder) {
    setupLines.push(`    const payload = ${builder}();`);
  } else if (op.hasBody) {
    setupLines.push(`    const payload = {}; // TODO: build payload`);
  }

  // Request line
  const dataArg = op.hasBody
    ? `, { data: ${builder ? 'payload' : 'payload'} }`
    : '';
  const requestLine = `    const response = await request.${op.method}(${pathExpr}${dataArg});`;

  // Assertion lines
  const assertLines: string[] = [
    `    expect(response.status()).toBe(${op.successStatus});`,
  ];
  if (op.successStatus !== 204 && op.method !== 'delete') {
    const castType = typeName ? `: ${typeName}` : '';
    assertLines.push(`    const body${castType} = await response.json();`);
    assertLines.push(`    // TODO: add assertions for body`);
  }

  const setup = setupLines.length > 0 ? `\n${setupLines.join('\n')}\n` : '\n';

  return `
  test.skip('${METHOD} ${op.path} - TODO: ${op.summary}', async ({ request }) => {${setup}${requestLine}

${assertLines.join('\n')}
  });`;
}

function generateNewSpecFile(tag: string, stubs: string[]): string {
  const builder  = builderFor(tag);
  const typeName = typeFor(tag);

  const importLines = [
    `import { test, expect } from '@playwright/test';`,
  ];
  if (builder) {
    importLines.push(`import { ${builder} } from '../fixtures/factories';`);
  }
  if (typeName) {
    importLines.push(`import type { ${typeName} } from '../types/petstore';`);
  }

  return `${importLines.join('\n')}

test.describe('${tag.charAt(0).toUpperCase() + tag.slice(1)} API', () => {${stubs.join('')}
});
`;
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function downloadSpec(): Promise<void> {
  info(`Downloading OpenAPI spec from ${OPENAPI_URL}`);
  const res = await fetch(OPENAPI_URL);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const body = await res.text();
  await writeFile(OPENAPI_PATH, body, 'utf-8');
  ok(`Spec saved to ${OPENAPI_PATH}`);
}

async function main(): Promise<void> {
  log('');
  log(`${c.bold}playwright-api-swagger — sync-tests${c.reset}`);
  log('─'.repeat(50));

  // ── 1. Optionally download fresh spec ────────────────────────────────────
  if (DOWNLOAD) {
    await downloadSpec();
  }

  // ── 2. Load and parse spec ───────────────────────────────────────────────
  if (!existsSync(SPEC_PATH)) {
    err(`Spec file not found: ${SPEC_PATH}`);
    err(`Run  npm run mcp:start  to download it, or use --download flag.`);
    process.exit(1);
  }

  const rawSpec = await readFile(SPEC_PATH, 'utf-8');
  const spec    = JSON.parse(rawSpec) as Record<string, unknown>;
  const hash    = hashSpec(rawSpec);
  const ops     = parseOperations(spec);

  info(`Parsed ${ops.length} operations from ${SPEC_PATH}`);
  log('');

  // ── 3. Diff against previous manifest ────────────────────────────────────
  let prevOps: Operation[] = [];
  let specChanged = false;

  if (existsSync(MANIFEST)) {
    const manifest = JSON.parse(await readFile(MANIFEST, 'utf-8')) as Manifest;
    specChanged = manifest.specHash !== hash;

    if (specChanged) {
      warn(`Spec has changed since last sync (${manifest.updatedAt})`);
      prevOps = manifest.operations;

      const prevIds = new Set(prevOps.map(o => `${o.method}:${o.path}`));
      const currIds = new Set(ops.map(o => `${o.method}:${o.path}`));

      const added   = ops.filter(o => !prevIds.has(`${o.method}:${o.path}`));
      const removed = prevOps.filter(o => !currIds.has(`${o.method}:${o.path}`));

      if (added.length > 0) {
        log(`  ${c.green}+ ${added.length} new operation(s):${c.reset}`);
        added.forEach(o => log(`    ${c.green}+${c.reset} ${o.method.toUpperCase().padEnd(7)} ${o.path}`));
        log('');
      }
      if (removed.length > 0) {
        log(`  ${c.red}- ${removed.length} removed operation(s):${c.reset}`);
        removed.forEach(o => {
          log(`    ${c.red}-${c.reset} ${o.method.toUpperCase().padEnd(7)} ${o.path}`);
        });
        warn(`Tests for removed operations may need to be deleted manually.`);
        log('');
      }
      if (added.length === 0 && removed.length === 0) {
        warn('Spec hash changed but no operations were added or removed (schema/summary change).');
        log('');
      }
    } else {
      ok(`Spec unchanged (hash ${hash})`);
      log('');
    }
  } else {
    info(`No previous manifest found — treating all operations as new.`);
    specChanged = true;
    log('');
  }

  // ── 4. Coverage scan ─────────────────────────────────────────────────────
  const corpus  = await loadTestCorpus();
  const covered = ops.filter(o => isCovered(o, corpus));
  const missing = ops.filter(o => !isCovered(o, corpus));

  log(`${c.bold}Coverage${c.reset}`);
  log(`  ${c.green}${covered.length} covered${c.reset}  /  ${ops.length} total operations`);

  if (missing.length === 0) {
    ok('All operations have test coverage.');
  } else {
    warn(`${missing.length} operation(s) have no test coverage:`);
    missing.forEach(o =>
      log(`  ${c.yellow}⚠${c.reset}  ${o.method.toUpperCase().padEnd(7)} ${o.path.padEnd(35)} ${c.grey}${o.operationId}${c.reset}`),
    );
  }
  log('');

  // ── 5. Show full coverage table (verbose) ────────────────────────────────
  log(`${c.bold}Full operation coverage:${c.reset}`);
  const byTag = new Map<string, Operation[]>();
  for (const op of ops) {
    if (!byTag.has(op.tag)) byTag.set(op.tag, []);
    byTag.get(op.tag)!.push(op);
  }
  for (const [tag, tagOps] of byTag) {
    log(`  ${c.cyan}${tag}${c.reset}`);
    for (const op of tagOps) {
      const covMark = isCovered(op, corpus) ? `${c.green}✓${c.reset}` : `${c.yellow}⚠${c.reset}`;
      dim(`    ${covMark} ${op.method.toUpperCase().padEnd(7)} ${op.path}`);
    }
  }
  log('');

  // ── 6. Write stubs (unless --check) ───────────────────────────────────────
  if (missing.length > 0 && !CHECK) {
    info(`Writing test stubs for ${missing.length} uncovered operation(s)...`);
    log('');

    // Group missing ops by tag
    const byTagMissing = new Map<string, Operation[]>();
    for (const op of missing) {
      if (!byTagMissing.has(op.tag)) byTagMissing.set(op.tag, []);
      byTagMissing.get(op.tag)!.push(op);
    }

    for (const [tag, tagOps] of byTagMissing) {
      const specFile = specFileFor(tag);
      const stubs = tagOps.map(generateStub);

      if (existsSync(specFile)) {
        // Append stubs before the closing });
        let existing = await readFile(specFile, 'utf-8');
        const closeIdx = existing.lastIndexOf('});');
        if (closeIdx !== -1) {
          existing =
            existing.slice(0, closeIdx) +
            stubs.join('') +
            '\n' +
            existing.slice(closeIdx);
        } else {
          existing += stubs.join('') + '\n';
        }
        await writeFile(specFile, existing, 'utf-8');
        ok(`Appended ${stubs.length} stub(s) → ${specFile.replace(ROOT + '/', '')}`);
      } else {
        // Create a new spec file for this tag
        const content = generateNewSpecFile(tag, stubs);
        await writeFile(specFile, content, 'utf-8');
        ok(`Created  ${specFile.replace(ROOT + '/', '')}  (${stubs.length} stub(s))`);
      }

      tagOps.forEach(op =>
        log(`    ${c.grey}+ ${op.method.toUpperCase()} ${op.path}${c.reset}`),
      );
    }
    log('');
  } else if (missing.length > 0 && CHECK) {
    warn(`--check mode: skipping stub generation (${missing.length} gaps remain).`);
    log('');
  }

  // ── 7. Update manifest ────────────────────────────────────────────────────
  if (!CHECK) {
    const manifest: Manifest = {
      specHash:   hash,
      operations: ops,
      updatedAt:  new Date().toISOString(),
    };
    await writeFile(MANIFEST, JSON.stringify(manifest, null, 2), 'utf-8');
    ok(`Manifest updated → .spec-manifest.json`);
  }

  log('');
  log(`${c.bold}Done.${c.reset}  Run  ${c.cyan}npm test${c.reset}  to execute the full suite.`);
  log('');

  if (missing.length > 0 && !CHECK) {
    log(`${c.yellow}Note:${c.reset} New stubs use ${c.bold}test.skip${c.reset} — implement them and remove the skip.`);
    log('');
  }
}

main().catch((e: unknown) => {
  err(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
