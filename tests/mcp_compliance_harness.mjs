#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');
const SERVER_ENTRY = resolve(PROJECT_ROOT, 'mcp-server.mjs');

// Logger
const log = {
    info: (msg) => console.log(`[INFO] ${msg}`),
    pass: (msg) => console.log(`[PASS] ${msg}`),
    fail: (msg) => console.error(`[FAIL] ${msg}`),
    warn: (msg) => console.warn(`[WARN] ${msg}`),
    section: (msg) => console.log(`\n=== ${msg} ===\n`),
};

const stats = {
    passed: 0,
    failed: 0,
    warnings: 0,
};

function record(type, msg) {
    if (type === 'pass') {
        stats.passed++;
        log.pass(msg);
    } else if (type === 'fail') {
        stats.failed++;
        log.fail(msg);
    } else if (type === 'warn') {
        stats.warnings++;
        log.warn(msg);
    }
}

async function runHarness() {
    log.section('Phase 1: Handshake & Capabilities');

    const transport = new StdioClientTransport({
        command: process.execPath,
        args: [SERVER_ENTRY],
        cwd: PROJECT_ROOT,
        env: { ...process.env, MCP_TEST_MODE: '1', NODE_ENV: 'test' },
    });

    const client = new Client(
        { name: 'mcp-compliance-harness', version: '1.0.0' },
        { capabilities: { roots: { listChanged: true } } }
    );

    try {
        await client.connect(transport);
        record('pass', 'Connected to server via StdioClientTransport');
    } catch (err) {
        record('fail', `Failed to connect: ${err.message}`);
        process.exit(1);
    }

    // Check capabilities
    const serverCapabilities = client.getServerCapabilities();
    if (serverCapabilities) {
        record('pass', `Received server capabilities: ${JSON.stringify(serverCapabilities)}`);
    } else {
        record('warn', 'Server did not send capabilities');
    }

    const serverVersion = client.getServerVersion();
    if (serverVersion) {
        record('pass', `Server version: ${JSON.stringify(serverVersion)}`);
    } else {
        record('warn', 'Server did not send version info');
    }

    // --- Phase 2: Tool Testing ---
    log.section('Phase 2: Tool Testing');

    let tools = [];
    try {
        const result = await client.listTools();
        tools = result.tools;
        record('pass', `Listed ${tools.length} tools`);
    } catch (err) {
        record('fail', `Failed to list tools: ${err.message}`);
    }

    for (const tool of tools) {
        console.log(`\nTesting Tool: ${tool.name}`);

        // 1. Valid Call (Best Effort)
        // We try to construct minimal valid args based on schema
        const validArgs = generateMinimalArgs(tool.inputSchema);
        try {
            log.info(`Attempting valid call with args: ${JSON.stringify(validArgs)}`);
            const res = await client.callTool({ name: tool.name, arguments: validArgs });
            if (res.isError) {
                record('warn', `Tool ${tool.name} returned application error (this is valid protocol behavior): ${JSON.stringify(res)}`);
            } else {
                record('pass', `Tool ${tool.name} executed successfully`);
            }
        } catch (err) {
            record('fail', `Tool ${tool.name} threw protocol error on valid args: ${err.message}`);
        }

        // 2. Missing Parameters (if schema requires them)
        if (hasRequiredParams(tool.inputSchema)) {
            try {
                log.info(`Attempting missing params call (empty object)`);
                await client.callTool({ name: tool.name, arguments: {} });
                record('fail', `Tool ${tool.name} should have failed with missing params but succeeded`);
            } catch (err) {
                record('pass', `Tool ${tool.name} correctly failed on missing params: ${err.message}`);
            }
        }

        // 3. Wrong Parameter Types
        const invalidArgs = generateInvalidArgs(tool.inputSchema);
        if (invalidArgs) {
            try {
                log.info(`Attempting wrong types call: ${JSON.stringify(invalidArgs)}`);
                await client.callTool({ name: tool.name, arguments: invalidArgs });
                record('fail', `Tool ${tool.name} should have failed with invalid arg types but succeeded`);
            } catch (err) {
                record('pass', `Tool ${tool.name} correctly failed on invalid arg types: ${err.message}`);
            }
        }

        // 4. Oversized Input
        try {
            log.info(`Attempting oversized input (1MB string in first param)`);
            const hugeArgs = generateHugeArgs(tool.inputSchema);
            if (hugeArgs) {
                // We expect this might fail or timeout, or succeed if the server is robust. 
                // Mainly checking it doesn't crash the server (disconnect).
                await client.callTool({ name: tool.name, arguments: hugeArgs });
                record('pass', `Tool ${tool.name} handled oversized input without crashing`);
            }
        } catch (err) {
            // It's okay if it errors, as long as connection stays alive.
            record('pass', `Tool ${tool.name} rejected oversized input: ${err.message}`);
        }

        // Check if still connected
        try {
            await client.listTools();
        } catch (e) {
            record('fail', `Server crashed/disconnected after oversized input on ${tool.name}`);
            // Reconnect if possible or abort? For now abort.
            process.exit(1);
        }
    }

    // 5. Unknown Tool
    try {
        log.info('Calling non-existent tool "non_existent_tool_xyz"');
        await client.callTool({ name: 'non_existent_tool_xyz', arguments: {} });
        record('fail', 'Server should have thrown error for unknown tool');
    } catch (err) {
        record('pass', `Server correctly rejected unknown tool: ${err.message}`);
    }


    // --- Phase 3: Resource Testing ---
    log.section('Phase 3: Resource Testing');
    try {
        const resResult = await client.listResources();
        const resources = resResult.resources || [];
        record('pass', `Listed ${resources.length} resources`);

        for (const res of resources) {
            try {
                log.info(`Reading resource: ${res.uri}`);
                await client.readResource({ uri: res.uri });
                record('pass', `Read resource ${res.uri} successfully`);
            } catch (err) {
                record('fail', `Failed to read resource ${res.uri}: ${err.message}`);
            }
        }

        // Non-existent resource
        try {
            log.info('Reading non-existent resource: file:///tmp/non-existent-resource');
            await client.readResource({ uri: 'file:///tmp/non-existent-resource' });
            record('fail', 'Server should have failed on non-existent resource');
        } catch (err) {
            record('pass', `Server correctly rejected non-existent resource: ${err.message}`);
        }

    } catch (err) {
        // It's possible the server doesn't support resources, which is fine if declared.
        // But listResources should probably succeed with empty list or throw "Method not found"
        record('warn', `listResources failed (maybe not supported?): ${err.message}`);
    }


    // --- Phase 4: Robustness / Stress ---
    log.section('Phase 4: Robustness / Stress');

    // Parallel Calls
    log.info('Running 5 parallel listTools calls');
    try {
        const promises = [];
        for (let i = 0; i < 5; i++) {
            promises.push(client.listTools());
        }
        await Promise.all(promises);
        record('pass', 'Handled 5 parallel requests successfully');
    } catch (err) {
        record('fail', `Failed parallel requests: ${err.message}`);
    }

    // --- Phase 5: Summary ---
    log.section('Phase 5: Summary');
    console.log(`Passed: ${stats.passed}`);
    console.log(`Failed: ${stats.failed}`);
    console.log(`Warnings: ${stats.warnings}`);

    await client.close();
}

// Helpers
function generateMinimalArgs(schema) {
    if (!schema || !schema.properties) return {};
    const args = {};
    const required = schema.required || [];
    for (const key of required) {
        const prop = schema.properties[key];
        if (prop.type === 'string') args[key] = 'test';
        else if (prop.type === 'integer' || prop.type === 'number') args[key] = 0;
        else if (prop.type === 'boolean') args[key] = false;
        else if (prop.type === 'array') args[key] = [];
        else if (prop.type === 'object') args[key] = {};
    }
    return args;
}

function hasRequiredParams(schema) {
    return schema && schema.required && schema.required.length > 0;
}

function generateInvalidArgs(schema) {
    if (!schema || !schema.properties) return null;
    const args = {};
    let hasInvalid = false;
    // Just find one property to mess up
    for (const key in schema.properties) {
        const prop = schema.properties[key];
        if (prop.type === 'string') { args[key] = 123; hasInvalid = true; }
        else if (prop.type === 'integer') { args[key] = "not-an-int"; hasInvalid = true; }
        // Add other types if needed, but this is enough to test validation
        if (hasInvalid) break;
    }
    return hasInvalid ? args : null;
}

function generateHugeArgs(schema) {
    if (!schema || !schema.properties) return null;
    const args = {};
    let hasString = false;
    for (const key in schema.properties) {
        if (schema.properties[key].type === 'string') {
            args[key] = 'a'.repeat(1024 * 1024); // 1MB
            hasString = true;
            break;
        }
    }
    // If no string prop, just add a dummy one (server should ignore or fail validation)
    if (!hasString) {
        args['__huge_payload__'] = 'a'.repeat(1024 * 1024);
    }
    return args;
}

runHarness().catch(err => {
    console.error('Harness fatal error:', err);
    process.exit(1);
});
