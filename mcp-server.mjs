#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import OSC from "osc-js";

// Create OSC client to communicate with Ableton Live (AbletonOSC default UDP port 11000)
const osc = new OSC({ plugin: new OSC.DatagramPlugin({ send: { port: 11000 } }) });
osc.open();

// Small helper to coerce booleans to AbletonOSC int flags (0/1)
const toIntFlag = (v) => (v ? 1 : 0);

// Utility to send a message and await a response on the same address (AbletonOSC echoes to the request path)
function sendAndWait(address, ...args) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      osc.off(address, handler);
      reject(new Error(`Timeout waiting for Ableton response on ${address}. Is Ableton Live running with AbletonOSC enabled?`));
    }, 5000);

    const handler = (message) => {
      clearTimeout(timeout);
      osc.off(address, handler);
      resolve(message.args);
    };

    osc.on(address, handler);
    osc.send(new OSC.Message(address, ...args));
  });
}

// Function to get tempo from Ableton
async function getTempo() {
  const args = await sendAndWait("/live/song/get/tempo");
  return args[0];
}

// Function to set tempo in Ableton
function setTempo(tempo) {
  return new Promise((resolve) => {
    osc.send(new OSC.Message("/live/song/set/tempo", tempo));
    resolve(`Tempo set to ${tempo} BPM`);
  });
}

// Function to play the song
function play() {
  return new Promise((resolve) => {
    osc.send(new OSC.Message("/live/song/start_playing"));
    resolve("Playback started");
  });
}

// Function to stop the song
function stop() {
  return new Promise((resolve) => {
    osc.send(new OSC.Message("/live/song/stop_playing"));
    resolve("Playback stopped");
  });
}

// Function to start recording
function recordStart() {
  return new Promise((resolve) => {
    osc.send(new OSC.Message("/live/song/start_recording"));
    resolve("Recording started");
  });
}

// Function to stop recording
function recordStop() {
  return new Promise((resolve) => {
    osc.send(new OSC.Message("/live/song/stop_recording"));
    resolve("Recording stopped");
  });
}

// Mixer controls
function setTrackVolume(track, volume) {
  // AbletonOSC expects volume in 0..1
  if (typeof track !== "number" || track < 0) throw new Error("track must be a non-negative integer");
  if (typeof volume !== "number" || volume < 0 || volume > 1) throw new Error("volume must be a number between 0 and 1");
  return new Promise((resolve) => {
    osc.send(new OSC.Message("/live/track/set/volume", track, volume));
    resolve(`Track ${track} volume set to ${volume}`);
  });
}

function setTrackPan(track, pan) {
  // AbletonOSC expects pan in -1..1
  if (typeof track !== "number" || track < 0) throw new Error("track must be a non-negative integer");
  if (typeof pan !== "number" || pan < -1 || pan > 1) throw new Error("pan must be a number between -1 and 1");
  return new Promise((resolve) => {
    osc.send(new OSC.Message("/live/track/set/pan", track, pan));
    resolve(`Track ${track} pan set to ${pan}`);
  });
}

function setTrackMute(track, mute) {
  if (typeof track !== "number" || track < 0) throw new Error("track must be a non-negative integer");
  return new Promise((resolve) => {
    osc.send(new OSC.Message("/live/track/set/mute", track, toIntFlag(!!mute)));
    resolve(`Track ${track} mute set to ${!!mute}`);
  });
}

function setTrackSolo(track, solo) {
  if (typeof track !== "number" || track < 0) throw new Error("track must be a non-negative integer");
  return new Promise((resolve) => {
    osc.send(new OSC.Message("/live/track/set/solo", track, toIntFlag(!!solo)));
    resolve(`Track ${track} solo set to ${!!solo}`);
  });
}

function setTrackArm(track, arm) {
  if (typeof track !== "number" || track < 0) throw new Error("track must be a non-negative integer");
  return new Promise((resolve) => {
    osc.send(new OSC.Message("/live/track/set/arm", track, toIntFlag(!!arm)));
    resolve(`Track ${track} arm set to ${!!arm}`);
  });
}

// Device/VST controls
async function listTrackDevices(track) {
  if (typeof track !== "number" || track < 0) throw new Error("track must be a non-negative integer");
  // Request device list; AbletonOSC replies on the same address with an array of [index, name] pairs or a list of names depending on version
  const args = await sendAndWait("/live/track/get/devices", track);
  return args;
}

// List parameters for a given device (VSTs are devices)
async function listDeviceParameters(track, device) {
  if (typeof track !== "number" || track < 0) throw new Error("track must be a non-negative integer");
  if (typeof device !== "number" || device < 0) throw new Error("device must be a non-negative integer index");
  const args = await sendAndWait("/live/device/get/parameters", track, device);
  return args;
}

function setDeviceParam(track, device, param, value) {
  if (typeof track !== "number" || track < 0) throw new Error("track must be a non-negative integer");
  if (typeof device !== "number" || device < 0) throw new Error("device must be a non-negative integer index");
  if (typeof param !== "number" || param < 0) throw new Error("param must be a non-negative integer index");
  if (typeof value !== "number") throw new Error("value must be a number (normalized 0..1)");
  // Enforce normalized 0..1 value range for robustness
  const normalized = Math.max(0, Math.min(1, value));
  return new Promise((resolve) => {
    // Common AbletonOSC endpoint: /live/device/set/param track device param value
    osc.send(new OSC.Message("/live/device/set/param", track, device, param, normalized));
    resolve(`Set track ${track} device ${device} param ${param} to ${normalized}`);
  });
}

// Create MCP server
const server = new Server(
  {
    name: "ableton-live-assistant",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_tempo",
        description: "Get the current tempo of the Ableton Live set",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "set_tempo",
        description: "Set the tempo of the Ableton Live set",
        inputSchema: {
          type: "object",
          properties: {
            tempo: {
              type: "number",
              description: "The tempo in BPM (beats per minute), typically between 60 and 200",
            },
          },
          required: ["tempo"],
        },
      },
      {
        name: "play",
        description: "Start playback in Ableton Live",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "stop",
        description: "Stop playback in Ableton Live",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "record_start",
        description: "Start recording in Ableton Live",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "record_stop",
        description: "Stop recording in Ableton Live",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "set_track_volume",
        description: "Set a track's volume (0..1)",
        inputSchema: {
          type: "object",
          properties: {
            track: { type: "integer", minimum: 0, description: "Track index (0-based)" },
            volume: { type: "number", minimum: 0, maximum: 1, description: "Linear volume (0..1)" },
          },
          required: ["track", "volume"],
        },
      },
      {
        name: "set_track_pan",
        description: "Set a track's pan (-1..1)",
        inputSchema: {
          type: "object",
          properties: {
            track: { type: "integer", minimum: 0, description: "Track index (0-based)" },
            pan: { type: "number", minimum: -1, maximum: 1, description: "Pan value (-1..1)" },
          },
          required: ["track", "pan"],
        },
      },
      {
        name: "set_track_mute",
        description: "Toggle a track's mute state",
        inputSchema: {
          type: "object",
          properties: {
            track: { type: "integer", minimum: 0, description: "Track index (0-based)" },
            mute: { type: "boolean", description: "true to mute, false to unmute" },
          },
          required: ["track", "mute"],
        },
      },
      {
        name: "set_track_solo",
        description: "Toggle a track's solo state",
        inputSchema: {
          type: "object",
          properties: {
            track: { type: "integer", minimum: 0, description: "Track index (0-based)" },
            solo: { type: "boolean", description: "true to solo, false to unsolo" },
          },
          required: ["track", "solo"],
        },
      },
      {
        name: "set_track_arm",
        description: "Toggle a track's arm state",
        inputSchema: {
          type: "object",
          properties: {
            track: { type: "integer", minimum: 0, description: "Track index (0-based)" },
            arm: { type: "boolean", description: "true to arm, false to disarm" },
          },
          required: ["track", "arm"],
        },
      },
      {
        name: "list_track_devices",
        description: "List devices on a track (returns raw OSC args — typically indices and names)",
        inputSchema: {
          type: "object",
          properties: {
            track: { type: "integer", minimum: 0, description: "Track index (0-based)" },
          },
          required: ["track"],
        },
      },
      {
        name: "list_device_parameters",
        description: "List parameters (names and indices) for a given device on a track",
        inputSchema: {
          type: "object",
          properties: {
            track: { type: "integer", minimum: 0, description: "Track index (0-based)" },
            device: { type: "integer", minimum: 0, description: "Device index on the track (0-based)" },
          },
          required: ["track", "device"],
        },
      },
      {
        name: "set_device_param",
        description: "Set a device/VST parameter value by indices (value normalized 0..1)",
        inputSchema: {
          type: "object",
          properties: {
            track: { type: "integer", minimum: 0, description: "Track index (0-based)" },
            device: { type: "integer", minimum: 0, description: "Device index on the track (0-based)" },
            param: { type: "integer", minimum: 0, description: "Parameter index on the device (0-based)" },
            value: { type: "number", minimum: 0, maximum: 1, description: "Normalized parameter value (0..1)" },
          },
          required: ["track", "device", "param", "value"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "get_tempo": {
        const tempo = await getTempo();
        return {
          content: [
            {
              type: "text",
              text: `Current tempo: ${tempo} BPM`,
            },
          ],
        };
      }

      case "set_tempo": {
        if (!args.tempo || typeof args.tempo !== "number") {
          throw new Error("Invalid tempo value");
        }
        const result = await setTempo(args.tempo);
        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      }

      case "play": {
        const result = await play();
        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      }

      case "stop": {
        const result = await stop();
        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      }

      case "record_start": {
        const result = await recordStart();
        return { content: [{ type: "text", text: result }] };
      }

      case "record_stop": {
        const result = await recordStop();
        return { content: [{ type: "text", text: result }] };
      }

      case "set_track_volume": {
        const { track, volume } = args || {};
        const result = await setTrackVolume(track, volume);
        return { content: [{ type: "text", text: result }] };
      }

      case "set_track_pan": {
        const { track, pan } = args || {};
        const result = await setTrackPan(track, pan);
        return { content: [{ type: "text", text: result }] };
      }

      case "set_track_mute": {
        const { track, mute } = args || {};
        const result = await setTrackMute(track, mute);
        return { content: [{ type: "text", text: result }] };
      }

      case "set_track_solo": {
        const { track, solo } = args || {};
        const result = await setTrackSolo(track, solo);
        return { content: [{ type: "text", text: result }] };
      }

      case "set_track_arm": {
        const { track, arm } = args || {};
        const result = await setTrackArm(track, arm);
        return { content: [{ type: "text", text: result }] };
      }

      case "list_track_devices": {
        const { track } = args || {};
        const devices = await listTrackDevices(track);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ track, devices }),
            },
          ],
        };
      }

      case "list_device_parameters": {
        const { track, device } = args || {};
        const parameters = await listDeviceParameters(track, device);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ track, device, parameters }),
            },
          ],
        };
      }

      case "set_device_param": {
        const { track, device, param, value } = args || {};
        const result = await setDeviceParam(track, device, param, value);
        return { content: [{ type: "text", text: result }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Ableton Live MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
