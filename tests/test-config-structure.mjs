#!/usr/bin/env node
// Test to verify the configuration file structure is valid
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.resolve(__dirname, '../ableton_mcp_tools.json');

console.log('Testing configuration file structure...\n');

// Load configuration
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Test basic structure
assert(config.server_name === 'ableton-osc-mcp', 'server_name should be "ableton-osc-mcp"');
assert(Array.isArray(config.tools), 'tools should be an array');
assert(config.tools.length > 0, 'should have tools defined');

console.log(`✓ Configuration loaded successfully`);
console.log(`✓ Server name: ${config.server_name}`);
console.log(`✓ Total tools: ${config.tools.length}`);

// Verify new structure with osc_mapping
const toolsWithMapping = config.tools.filter(t => t.osc_mapping);
console.log(`✓ Tools with osc_mapping: ${toolsWithMapping.length}`);

// Test first tool structure
const firstTool = config.tools[0];
assert(firstTool.name, 'tool should have name');
assert(firstTool.description, 'tool should have description');
assert(firstTool.input_schema, 'tool should have input_schema');
assert(firstTool.osc_mapping, 'tool should have osc_mapping');

console.log(`✓ First tool (${firstTool.name}) has correct structure`);

// Verify specific tools exist
const toolNames = config.tools.map(t => t.name);
const expectedTools = [
    'get_song_info',
    'set_tempo',
    'transport_play',
    'transport_stop',
    'transport_continue',
    'get_num_tracks',
    'fire_clip_slot',
    'create_clip'
];

for (const toolName of expectedTools) {
    assert(toolNames.includes(toolName), `Expected tool "${toolName}" should exist`);
}

console.log(`✓ All expected core tools are present`);

// Verify transport_control is NOT present (it was replaced)
assert(!toolNames.includes('transport_control'), 'transport_control should not exist (replaced by separate tools)');
console.log(`✓ Old transport_control tool correctly removed`);

// Verify parameter names use track_id/clip_id (not track_index/clip_index)
const fireClipSlot = config.tools.find(t => t.name === 'fire_clip_slot');
if (fireClipSlot) {
    const params = fireClipSlot.input_schema.properties;
    assert(params.track_id, 'fire_clip_slot should use track_id parameter');
    assert(params.clip_id, 'fire_clip_slot should use clip_id parameter');
    assert(!params.track_index, 'fire_clip_slot should NOT use track_index');
    assert(!params.clip_index, 'fire_clip_slot should NOT use clip_index');
    console.log(`✓ Parameters use correct naming (track_id/clip_id)`);
}

console.log('\n✅ All configuration structure tests passed!');
