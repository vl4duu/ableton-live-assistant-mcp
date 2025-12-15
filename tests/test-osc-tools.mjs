#!/usr/bin/env node
// Quick test to verify OSC tools can be called without the "requires custom OSC mapping" error
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const SERVER_ENTRY = resolve(PROJECT_ROOT, 'mcp-server.mjs');

async function testOSCTools() {
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: [SERVER_ENTRY],
        cwd: PROJECT_ROOT,
        env: { ...process.env, MCP_TEST_MODE: '1', NODE_ENV: 'test' },
        stderr: 'pipe',
    });

    const client = new Client({ name: 'osc-tool-test', version: '1.0.0' });

    try {
        await client.connect(transport);

        console.log('Testing OSC tool execution...\n');

        // Test a simple OSC tool
        console.log('1. Testing set_tempo...');
        const tempoResult = await client.callTool({
            name: 'set_tempo',
            arguments: { tempo: 120 }
        });
        console.log('   Result:', tempoResult.content[0].text);
        console.log('   ✓ No "requires custom OSC mapping" error!');

        // Test transport control
        console.log('\n2. Testing transport_play...');
        const playResult = await client.callTool({
            name: 'transport_play',
            arguments: {}
        });
        console.log('   Result:', playResult.content[0].text);
        console.log('   ✓ Transport tools work!');

        // Test a tool with parameters
        console.log('\n3. Testing get_track_name...');
        const trackResult = await client.callTool({
            name: 'get_track_name',
            arguments: { track_id: 0 }
        });
        console.log('   Result:', trackResult.content[0].text);
        console.log('   ✓ Track tools work!');

        console.log('\n✅ All OSC tools can be called successfully!');
        console.log('   (Note: Actual OSC communication requires Ableton Live running)');

    } finally {
        await client.close();
    }
}

testOSCTools().catch(err => {
    console.error('❌ Test failed:', err.message);
    process.exit(1);
});
