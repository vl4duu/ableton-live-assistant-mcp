# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an MCP (Model Context Protocol) server that enables AI assistants to control Ableton Live via OSC (Open Sound Control). The server translates MCP tool calls into OSC messages that communicate with the AbletonOSC plugin running in Ableton Live.

## Architecture

### Core Components

1. **mcp-server.mjs**: Main server implementation
   - Uses `@modelcontextprotocol/sdk` to implement the MCP protocol over stdio
   - Loads tool definitions from `ableton_mcp_tools.json`
   - Manages bidirectional OSC communication using `osc-js`
   - Provides both simple mappings (direct OSC calls) and complex handlers (multi-step operations)

2. **ableton_mcp_tools.json**: Tool configuration
   - Defines all available MCP tools with JSON Schema input validation
   - Each tool has an `osc_mapping` that specifies:
     - `address`: Single OSC address for simple operations
     - `params`: Array of parameter names to extract from tool arguments
     - `type: "composite"` with `calls`: Array of OSC addresses for multi-query operations
   - Tools without OSC mappings require custom handlers in `OSC_MAPPINGS` object

3. **OSC_MAPPINGS object** (mcp-server.mjs:56-414): Custom tool handlers
   - Complex operations that require multiple OSC calls (e.g., `get_song_info`, `list_tracks`)
   - Operations with custom parameter transformation (e.g., `set_track_property`, `set_global_quantization`)
   - Operations combining multiple OSC messages (e.g., `move_clip` = duplicate + delete)

### Communication Flow

```
AI Assistant → MCP Protocol (stdio) → mcp-server.mjs → OSC (UDP) → Ableton Live (AbletonOSC plugin)
                                                                ← OSC Response ←
```

### OSC Communication Patterns

1. **Fire-and-forget**: Commands that don't need responses (set operations)
   - Uses `fireAndForget()` function
   - MCP server sends message to AbletonOSC on port 11000
   - Example: `/live/song/set/tempo`

2. **Request-response**: Queries that need data back (get operations)
   - Uses `sendAndWait()` function with promise-based timeout handling
   - Timeout configurable via `ABLETON_OSC_TIMEOUT_MS` (default: 5000ms)
   - Example: `/live/song/get/tempo`
   - **Important bidirectional flow**:
     1. MCP server sends request FROM any port TO port 11000
     2. AbletonOSC receives request on port 11000
     3. AbletonOSC sends response TO port 11001 (NOT back to source port!)
     4. MCP server receives response on port 11001 (bound during initialization)

## Development Commands

### Running the Server
```bash
npm run start:mcp
```

### Testing
```bash
npm test
```

Runs the test suite in `tests/run-tests.mjs` which:
- Verifies the MCP server starts and responds correctly
- Tests tool listing and basic tool calls
- Ensures the server doesn't disconnect on errors
- Runs in test mode (sets `MCP_TEST_MODE=1` and `NODE_ENV=test`)

### Test Mode Behavior
When `MCP_TEST_MODE=1` or `NODE_ENV=test`:
- OSC socket is not opened (no actual Ableton connection)
- Tools return deterministic mock responses
- `health_check` returns "ok"
- Other tools return success messages

## Environment Configuration

Optional environment variables in `.env`:
- `ABLETON_OSC_HOST`: OSC server host (default: `127.0.0.1`)
- `ABLETON_OSC_PORT`: Port where AbletonOSC listens for requests (default: `11000`)
- `ABLETON_OSC_RESPONSE_PORT`: Port where MCP server listens for responses (default: `11001`)
  - **CRITICAL**: AbletonOSC sends responses to this fixed port, NOT back to the source port
  - Must match AbletonOSC's `OSC_RESPONSE_PORT` constant (see `abletonosc/constants.py`)
  - This is why the MCP server binds to port 11001 instead of using an ephemeral port
- `ABLETON_OSC_TIMEOUT_MS`: Response timeout in milliseconds (default: `5000`, range: 500-15000)

## Adding New Tools

To add a new tool to control Ableton Live:

1. **For simple tools** (single OSC call with direct parameter mapping):
   - Add tool definition to `ableton_mcp_tools.json` with:
     - `name`, `description`, `input_schema` (JSON Schema)
     - `osc_mapping.address`: The AbletonOSC endpoint
     - `osc_mapping.params`: Array of parameter names in order
   - The generic `handleTool()` function will handle it automatically

2. **For complex tools** (multiple OSC calls or custom logic):
   - Add tool definition to `ableton_mcp_tools.json` (can use minimal `osc_mapping` or omit it)
   - Add custom handler to `OSC_MAPPINGS` object in mcp-server.mjs:
     ```javascript
     tool_name: {
         async handler(args) {
             // Custom logic here
             const result = await sendAndWait("/live/some/address", args.param);
             return processedResult;
         }
     }
     ```
   - Use `sendAndWait()` for queries, `fireAndForget()` for commands
   - Custom handlers take precedence over JSON config

3. **Parameter conventions**:
   - Track/clip indices are 0-based
   - Boolean values for OSC: convert to 1 (true) or 0 (false)
   - Use `defaults` in osc_mapping for optional parameters (e.g., `length: 4.0`)

## Important Implementation Details

- **Error handling**: All OSC timeouts include helpful error messages suggesting to check if Ableton Live and AbletonOSC are running
- **Type conversions**: Boolean parameters must be converted to integers (0/1) for OSC transmission
- **Async operations**: All OSC operations are async; use `await` consistently
- **Tool handler precedence**: Custom handlers in `OSC_MAPPINGS` are checked before JSON config
- **Test compatibility**: Always consider test mode when adding new features

## Codebase Conventions

- ES modules (`.mjs` extension)
- Async/await for all asynchronous operations
- Error messages logged to stderr via `console.error()`
- Configuration loaded from external JSON file for maintainability
- Tool responses use `toolText()` helper for consistent formatting

## Troubleshooting

### Server Initialization

The MCP server now waits for the OSC socket to be ready before accepting requests (fixed Dec 2025). You should see:

```
Waiting for OSC connection to initialize...
✅ OSC client ready, sending to 127.0.0.1:11000, receiving on port 11001
OSC connection established
✅ Ableton Live MCP server running on stdio
   Loaded 52 tools from /path/to/ableton_mcp_tools.json
```

If the server fails to start:
- **Port conflict**: Another instance is running. Fix: `lsof -i :11001` then `kill <PID>`
- **Timeout during init**: OSC socket failed to open within 10 seconds. Check firewall/permissions.
- See `.claude/debugging-sessions/2025-12-14-osc-reliability-fix.md` for detailed troubleshooting.

### "Timeout waiting for Ableton response" errors

If GET operations (queries) timeout but SET operations (commands) work:

1. **Check port conflicts first** (most common issue):
   ```bash
   lsof -i :11001  # Find process using port
   kill <PID>      # Kill conflicting process
   ```
   - Multiple MCP server instances can accumulate and block the port
   - The server now detects this at startup and provides clear error messages

2. **Verify AbletonOSC is running**: Check Ableton Live Preferences > Link / Tempo / MIDI
   - Should see "AbletonOSC: Listening for OSC on port 11000"

3. **Check AbletonOSC logs**: Located at `[Ableton User Library]/Remote Scripts/AbletonOSC/logs/abletonosc.log`
   - Should see "Getting property" entries for queries
   - If queries appear in logs but responses timeout, verify port 11001 isn't blocked by firewall

4. **Test with standalone script**: Run `node tests/test-osc-bidirectional.mjs`
   - Should receive responses and show "SUCCESS!" messages
   - If this fails, the issue is with OSC communication, not the MCP layer

5. **Run reliability tests**: `node tests/test-reliability.mjs`
   - Tests various communication patterns
   - Should pass 4/6 tests if OSC is working

6. **Check server startup logs**: Ensure server waited for OSC initialization
   - If you see tool calls before "OSC connection established", report this as a bug
