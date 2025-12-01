
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');
const SERVER_ENTRY = resolve(PROJECT_ROOT, 'mcp-server.mjs');

async function debugUnknownTool() {
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: [SERVER_ENTRY],
        cwd: PROJECT_ROOT,
        env: { ...process.env, MCP_TEST_MODE: '1' },
    });

    const client = new Client({ name: 'debug', version: '1.0.0' }, { capabilities: {} });
    await client.connect(transport);

    try {
        console.log('Calling unknown tool...');
        const result = await client.callTool({ name: 'non_existent_tool_xyz', arguments: {} });
        console.log('Result:', JSON.stringify(result, null, 2));
    } catch (err) {
        console.log('Caught error:', err);
    }

    await client.close();
}

debugUnknownTool();
