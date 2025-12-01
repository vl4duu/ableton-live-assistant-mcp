# Ableton Live Assistant

**A powerful Model Context Protocol (MCP) server for controlling Ableton Live via AI.**

Enable your AI assistant (Claude, etc.) to interact with Ableton Live naturally. Query tracks, control playback, trigger clips, and navigate your set using simple natural language commands.

## Features

- **Playback Control**: Play, pause, stop, seek, and control tempo/metronome.
- **Track Management**: List tracks, arm/solo/mute, and query device chains.
- **Clip Launching**: Trigger clips by name or slot index.
- **Scene Navigation**: Fire scenes and navigate the arrangement.
- **Project Info**: Query song structure, cue points, and return tracks.
- **Robust Communication**: Uses OSC (Open Sound Control) for low-latency interaction.

## Prerequisites

- **Ableton Live 11** or higher (Standard or Suite).
- **Node.js** (v16 or higher).
- **AbletonOSC**: A remote script that allows Ableton Live to speak OSC.

## Installation

### 1. Install AbletonOSC
This server relies on the [AbletonOSC](https://github.com/ideoforms/AbletonOSC) remote script.

1.  Download the latest release of **AbletonOSC**.
2.  Extract the `AbletonOSC` folder to your Ableton Remote Scripts directory:
    *   **macOS**: `~/Music/Ableton/User Library/Remote Scripts/`
    *   **Windows**: `\Users\[Username]\Documents\Ableton\User Library\Remote Scripts\`
3.  **Restart Ableton Live**.
4.  Go to **Preferences** → **Link / Tempo / MIDI**.
5.  Under **Control Surface**, select **AbletonOSC**.
6.  Verify you see a status message: *"AbletonOSC: Listening for OSC on port 11000"*.

### 2. Install the MCP Server
Clone this repository and install dependencies:

```bash
git clone <your-repo-url> ableton-live-assistant
cd ableton-live-assistant
npm install
```

## Configuration

The server works out of the box with default settings, but you can customize it via a `.env` file.

1.  Copy the example environment file:
    ```bash
    cp .env.example .env
    ```
2.  Edit `.env` if you need to change ports (usually not required):

    ```env
    # Host where Ableton Live is running
    ABLETON_OSC_HOST=127.0.0.1
    
    # Port to SEND commands to Ableton (Default: 11000)
    ABLETON_OSC_SEND_PORT=11000
    
    # Port to RECEIVE replies from Ableton (Default: 11001)
    ABLETON_OSC_RECV_PORT=11001
    ```

> [!IMPORTANT]
> **Network Binding**: The server automatically binds to `0.0.0.0` to ensure it can receive replies from AbletonOSC regardless of whether it replies to `localhost` or `127.0.0.1`. This resolves common connectivity issues on macOS.

## Usage

### Starting the Server

```bash
npm run start:mcp
```

### Connecting to an MCP Client
To use this with **Claude Desktop**:

1.  Open your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`).
2.  Add the server:

    ```json
    {
      "mcpServers": {
        "ableton": {
          "command": "node",
          "args": ["/path/to/ableton-live-assistant/mcp-server.mjs"]
        }
      }
    }
    ```
3.  Restart Claude Desktop.

## Adding New Tools

The server uses a data-driven approach. All tools are defined in `ableton_mcp_tools.json`.

To add a new tool:
1.  **Define it** in `ableton_mcp_tools.json` (JSON Schema).
2.  **Map it** in `mcp-server.mjs` (OSC Address mapping).

## Troubleshooting

| Issue | Solution |
| :--- | :--- |
| **Server hangs on commands** | Ensure AbletonOSC is selected in Control Surfaces. Check if port 11001 is blocked. |
| **"Address already in use"** | Another instance of the server might be running. Run `pkill -f mcp-server` to clear it. |
| **No response from Ableton** | Verify Ableton Live is running and not showing an error in the status bar. |

## License

ISC
