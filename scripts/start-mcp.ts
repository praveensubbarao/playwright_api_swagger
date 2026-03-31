/**
 * start-mcp.ts
 *
 * Downloads the latest OpenAPI spec for an API project and starts its MCP server.
 *
 * Usage:
 *   npm run mcp:start                  starts petstore MCP (default)
 *   npm run mcp:start -- --api petstore
 *   npm run mcp:start -- --api my-other-api
 *
 * Config is read from apis/<name>/api.config.json:
 *   swaggerUri  — URL to download the OpenAPI spec from
 *   baseUrl     — target URL the MCP server forwards requests to
 *   mcpPort     — port to start the MCP server on (default 8080)
 *   specFile    — relative path within the api dir to save the spec
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = resolve(__dirname, '..');

// ─── CLI flags ───────────────────────────────────────────────────────────────

const args     = process.argv.slice(2);
const apiFlag  = args.indexOf('--api');
const API_NAME = apiFlag !== -1 ? args[apiFlag + 1] : 'petstore';
const API_DIR  = resolve(ROOT, 'apis', API_NAME);

// ─── Load api.config.json ────────────────────────────────────────────────────

interface ApiConfig {
  name: string;
  swaggerUri: string;
  baseUrl: string;
  specFile: string;
  mcpPort: number;
}

const configPath = resolve(API_DIR, 'api.config.json');
if (!existsSync(configPath)) {
  console.error(`✘ No api.config.json found at ${configPath}`);
  console.error(`  Run:  npm run bootstrap -- --api ${API_NAME}`);
  process.exit(1);
}

const config = JSON.parse(await readFile(configPath, 'utf-8')) as ApiConfig;
const specPath  = resolve(API_DIR, config.specFile);
const targetUrl = config.baseUrl.replace(/\/$/, ''); // strip trailing slash for MCP
const port      = String(config.mcpPort ?? 8080);

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`→ Starting MCP server for: ${config.name}`);
  console.log(`  Swagger URI : ${config.swaggerUri}`);
  console.log(`  Target URL  : ${targetUrl}`);
  console.log(`  Port        : ${port}`);
  console.log('');

  console.log(`→ Downloading spec from ${config.swaggerUri}`);
  const res = await fetch(config.swaggerUri);

  if (!res.ok) {
    throw new Error(`Failed to download spec: ${res.status} ${res.statusText}`);
  }

  const body = await res.text();
  await mkdir(resolve(API_DIR, 'mcp'), { recursive: true });
  await writeFile(specPath, body, 'utf-8');
  console.log(`✓ Spec saved to ${specPath.replace(ROOT + '/', '')}`);
  console.log('');

  console.log(`→ Starting MCP server on http://localhost:${port}`);
  const child = spawn('npx', [
    'api-to-mcp',
    '--spec',      specPath,
    '--port',      port,
    '--targetUrl', targetUrl,
  ], {
    cwd:   ROOT,
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    console.log(`MCP server exited with code ${code}`);
    process.exit(code ?? 0);
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
