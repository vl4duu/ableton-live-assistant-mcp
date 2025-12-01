#!/usr/bin/env node
// Minimal test suite to ensure the MCP server doesn't disconnect on tool calls
// and returns sensible responses. Uses the official MCP SDK client over stdio.

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import assert from 'assert';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ROOT = resolve(__dirname, '..');
const SERVER_ENTRY = resolve(PROJECT_ROOT, 'mcp-server.mjs');

async function withClient(fn) {
  const transport = new StdioClientTransport({
    // Use the current Node.js executable directly to start the MCP server
    command: process.execPath,
    args: [SERVER_ENTRY],
    cwd: PROJECT_ROOT,
    env: { ...process.env, MCP_TEST_MODE: '1', NODE_ENV: 'test' },
    stderr: 'pipe',
  });

  const client = new Client({ name: 'ableton-live-assistant-tests', version: '1.0.0' });
  try {
    await client.connect(transport);
    return await fn(client, transport);
  } finally {
    try {
      await client.close();
    } catch {}
  }
}

async function testListTools() {
  await withClient(async (client) => {
    const res = await client.listTools({});
    assert(Array.isArray(res.tools), 'tools should be an array');
    const names = res.tools.map((t) => t.name);
    assert(names.includes('health_check'), 'health_check tool should be listed');
    console.log('✓ list_tools returns tools and includes health_check');
  });
}

async function testHealthCheck() {
  await withClient(async (client) => {
    const result = await client.callTool({ name: 'health_check', arguments: {} });
    assert.strictEqual(result.isError, undefined, 'health_check should not return isError');
    const text = (result.content?.find?.(c => c.type === 'text')?.text) ?? '';
    assert(text.includes('ok'), 'health_check should return ok status text');
    console.log('✓ call_tool health_check succeeds');
  });
}

async function testGetTempoDoesNotDisconnect() {
  await withClient(async (client) => {
    // Call a tool that may require AbletonOSC. We accept either success or an error payload,
    // but the server must not disconnect.
    try {
      const result = await client.callTool({ name: 'get_tempo', arguments: {} });
      // Either success or error is fine; ensure shape is present
      assert(result && typeof result === 'object', 'get_tempo should return a result object');
    } catch (err) {
      // A thrown error likely indicates a transport disconnect; fail the test
      assert.fail(`get_tempo threw unexpectedly (possible disconnect): ${err?.message || err}`);
    }

    // Ensure client can still make requests after the call
    const again = await client.listTools({});
    assert(Array.isArray(again.tools), 'server should still respond after get_tempo');
    console.log('✓ call_tool get_tempo does not disconnect the server');
  });
}

async function main() {
  try {
    await testListTools();
    await testHealthCheck();
    await testGetTempoDoesNotDisconnect();
    console.log('\nAll tests passed');
  } catch (e) {
    console.error('TEST FAILURE:', e?.stack || e);
    process.exitCode = 1;
  }
}

main();
