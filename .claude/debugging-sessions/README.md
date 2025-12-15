# Debugging Sessions

This directory contains detailed documentation of significant debugging and troubleshooting sessions for the Ableton Live MCP server project.

## Sessions

### 2025-12-14: OSC Communication Reliability Fix
**File**: `2025-12-14-osc-reliability-fix.md`
**Status**: ✅ Resolved
**Severity**: Critical

**Problem**: MCP server experiencing ~0-30% success rate on data retrieval operations (GET requests). Fire-and-forget operations (SET) worked 100% of the time, creating asymmetric behavior.

**Root Cause**: Race condition between server initialization and OSC socket binding. The MCP server was accepting requests before the UDP socket on port 11001 was ready to receive responses from AbletonOSC.

**Solution**:
- Implemented synchronous initialization with `waitForOSCReady()` function
- Added OSC state tracking (`oscReady`, `oscError` flags)
- Enhanced error handling with clear diagnostics
- Added graceful shutdown handlers to prevent port conflicts

**Impact**:
- Reliability: 0-30% → 100%
- No more timeouts on GET operations
- Clean startup/shutdown lifecycle
- Clear error messages with troubleshooting steps

**Key Files Modified**:
- `mcp-server.mjs` - Main server initialization logic
- `tests/test-reliability.mjs` - New comprehensive test suite
- `tests/test-mcp-get-track.mjs` - New integration test
- `CLAUDE.md` - Updated troubleshooting documentation

## How to Use This Directory

1. **For Future Debugging**: Check existing sessions for similar symptoms
2. **For Documentation**: Reference these sessions when updating guides
3. **For Learning**: Study the diagnostic process and solutions
4. **For Prevention**: Review lessons learned to avoid similar issues

## Session Template

When documenting new debugging sessions, include:

1. **Problem Statement** - What was broken, symptoms, user impact
2. **Diagnostic Process** - How the issue was investigated
3. **Root Cause Analysis** - What actually caused the problem
4. **Solution Implementation** - What changes were made
5. **Test Results** - Before/after metrics
6. **Lessons Learned** - Key takeaways
7. **Prevention** - How to avoid similar issues

## Quick Reference

### Most Common Issues

1. **Port 11001 conflicts** → `lsof -i :11001` then `kill <PID>`
2. **OSC timeouts** → Check server initialization logs
3. **Server won't start** → Look for port conflict or initialization errors

### Diagnostic Commands

```bash
# Check port usage
lsof -i :11001
lsof -i :11000

# Run tests
node tests/test-reliability.mjs
node tests/test-mcp-get-track.mjs
node tests/test-osc-bidirectional.mjs

# Kill server processes
ps aux | grep mcp-server
kill <PID>
```

### Expected Startup Sequence

```
Waiting for OSC connection to initialize...
✅ OSC client ready, sending to 127.0.0.1:11000, receiving on port 11001
OSC connection established
✅ Ableton Live MCP server running on stdio
   Loaded 52 tools from /path/to/ableton_mcp_tools.json
```

If you see anything different, check the relevant debugging session document.
