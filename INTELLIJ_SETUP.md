# IntelliJ AI Chat Integration

## Setup Instructions

### 1. Configure MCP Server in IntelliJ

1. Open **IntelliJ IDEA**
2. Go to **Settings/Preferences** → **Tools** → **AI Assistant** → **Model Context Protocol**
3. Click **+** to add a new MCP server
4. Configure with the following details:

**Server Name:** Ableton Live Assistant

**Command:** `node`

**Arguments:** `/Users/vl4duu/ableton-live-assistant/mcp-server.mjs`

**Working Directory:** `/Users/vl4duu/ableton-live-assistant`

### 2. Enable the Server

1. Check the box next to "Ableton Live Assistant" to enable it
2. Click **OK** to save

### 3. Start Using in AI Chat

Once configured, you can use IntelliJ's AI Chat to control Ableton Live with natural language:

**Example commands:**
- "What is the current tempo?"
- "Set the tempo to 120 BPM"
- "Start playing"
- "Stop playback"
- "Change the tempo to 140"

### Available Tools

The MCP server exposes these tools that IntelliJ AI can use:

- **get_tempo** - Get current tempo
- **set_tempo** - Set tempo (BPM)
- **play** - Start playback
- **stop** - Stop playback

### Prerequisites

Make sure:
1. ✓ Ableton Live is running
2. ✓ AbletonOSC is selected in Ableton Preferences → Link/Tempo/MIDI → Control Surface
3. ✓ You see "AbletonOSC: Listening for OSC on port 11000" in Ableton

### Troubleshooting

**If IntelliJ can't connect:**
- Verify the file path is correct: `/Users/vl4duu/ableton-live-assistant/mcp-server.mjs`
- Make sure Node.js is in your PATH
- Check IntelliJ's MCP server logs for errors

**If Ableton doesn't respond:**
- Verify AbletonOSC is enabled in Ableton Live
- Check logs at: `~/Music/Ableton/User Library/Remote Scripts/AbletonOSC/logs/`
- Restart Ableton Live if needed

### Testing the Server Manually

You can test the MCP server directly:

```bash
node /Users/vl4duu/ableton-live-assistant/mcp-server.mjs
```

It should output: "Ableton Live MCP server running on stdio"

Press Ctrl+C to stop.
