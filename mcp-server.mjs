#!/usr/bin/env node
import {Server} from "@modelcontextprotocol/sdk/server/index.js";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {CallToolRequestSchema, ListToolsRequestSchema} from "@modelcontextprotocol/sdk/types.js";
import OSC from "osc-js";
import fs from "fs";
import path from "path";
import {fileURLToPath} from "url";

// Configuration / constants
const TEST_MODE = process.env.MCP_TEST_MODE === "1" || process.env.NODE_ENV === "test";
const TIMEOUT_MS = Number(process.env.ABLETON_OSC_TIMEOUT_MS) || 5000;
const OSC_HOST = process.env.ABLETON_OSC_HOST || "127.0.0.1";
const OSC_SEND_PORT = Number(process.env.ABLETON_OSC_SEND_PORT) || 11000;
const OSC_RECV_PORT = Number(process.env.ABLETON_OSC_RECV_PORT) || 11001;

// Load tool specifications from ableton_mcp_tools.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOOL_SPEC_PATH = path.resolve(__dirname, "ableton_mcp_tools.json");

let toolsConfig = {tools: []};

try {
    if (fs.existsSync(TOOL_SPEC_PATH)) {
        const raw = fs.readFileSync(TOOL_SPEC_PATH, "utf8");
        toolsConfig = JSON.parse(raw);
    } else {
        console.error(`Warning: ${TOOL_SPEC_PATH} not found. No tools will be available.`);
    }
} catch (e) {
    console.error("Warning: failed to load ableton_mcp_tools.json:", e?.message || e);
}

// OSC client to communicate with Ableton Live
const osc = new OSC({
    plugin: new OSC.DatagramPlugin({
        open: {host: "0.0.0.0", port: OSC_RECV_PORT},
        send: {host: OSC_HOST, port: OSC_SEND_PORT},
    }),
});

osc.on("open", () => {
    console.error(`OSC listening on ${OSC_HOST}:${OSC_RECV_PORT}`);
});

if (!TEST_MODE) {
    try {
        osc.open();
    } catch (e) {
        console.error("Warning: failed to open OSC socket:", e?.message || e);
    }
}

// OSC Command Mapping System
// Maps tool names to OSC addresses and parameter transformations
const OSC_MAPPINGS = {
    // Song/Global Operations
    get_song_info: {
        async handler() {
            const [tempo] = await sendAndWait("/live/song/get/tempo");
            const [numNumerator] = await sendAndWait("/live/song/get/time_signature_numerator");
            const [numDenominator] = await sendAndWait("/live/song/get/time_signature_denominator");
            const [isPlaying] = await sendAndWait("/live/song/get/is_playing");
            const [currentTime] = await sendAndWait("/live/song/get/current_song_time");
            const [loopStart] = await sendAndWait("/live/song/get/loop_start");
            const [loopEnd] = await sendAndWait("/live/song/get/loop_end");

            return {
                tempo,
                time_signature_numerator: numNumerator,
                time_signature_denominator: numDenominator,
                is_playing: !!isPlaying,
                current_song_time: currentTime,
                loop_start: loopStart,
                loop_end: loopEnd
            };
        }
    },

    set_tempo: {
        address: "/live/song/set/tempo",
        params: ["tempo"],
        fireAndForget: true
    },

    transport_control: {
        async handler(args) {
            const action = args.action;
            switch (action) {
                case "play":
                    fireAndForget("/live/song/start_playing");
                    return "Playback started";
                case "stop":
                    fireAndForget("/live/song/stop_playing");
                    return "Playback stopped";
                case "continue":
                    fireAndForget("/live/song/continue_playing");
                    return "Playback continued";
                case "toggle":
                    const [isPlaying] = await sendAndWait("/live/song/get/is_playing");
                    if (isPlaying) {
                        fireAndForget("/live/song/stop_playing");
                        return "Playback stopped";
                    } else {
                        fireAndForget("/live/song/start_playing");
                        return "Playback started";
                    }
                default:
                    throw new Error(`Unknown action: ${action}`);
            }
        }
    },

    // Track Operations
    list_tracks: {
        async handler(args) {
            const includeReturn = args.include_return_tracks || false;
            const includeMaster = args.include_master || false;
            const [numTracks] = await sendAndWait("/live/song/get/num_tracks");

            const tracks = [];
            for (let i = 0; i < numTracks; i++) {
                const [name] = await sendAndWait("/live/track/get/name", i);
                const [color] = await sendAndWait("/live/track/get/color", i);
                const [mute] = await sendAndWait("/live/track/get/mute", i);
                const [solo] = await sendAndWait("/live/track/get/solo", i);
                const [arm] = await sendAndWait("/live/track/get/arm", i);

                tracks.push({
                    id: i,
                    name,
                    color,
                    mute: !!mute,
                    solo: !!solo,
                    arm: !!arm
                });
            }

            return {tracks};
        }
    },

    get_track_clips: {
        async handler(args) {
            const trackIndex = args.track_index;
            const [numSlots] = await sendAndWait("/live/track/get/clip_slots", trackIndex);

            const clips = [];
            for (let i = 0; i < numSlots; i++) {
                const [hasClip] = await sendAndWait("/live/clip_slot/get/has_clip", trackIndex, i);
                if (hasClip) {
                    const [name] = await sendAndWait("/live/clip/get/name", trackIndex, i);
                    const [length] = await sendAndWait("/live/clip/get/length", trackIndex, i);
                    const [looping] = await sendAndWait("/live/clip/get/looping", trackIndex, i);

                    clips.push({
                        slot_index: i,
                        name,
                        length,
                        looping: !!looping
                    });
                }
            }

            return {clips};
        }
    },

    fire_clip: {
        address: "/live/clip_slot/fire",
        params: ["track_index", "clip_index"],
        fireAndForget: true
    },

    stop_track_clips: {
        address: "/live/track/stop_all_clips",
        params: ["track_index"],
        fireAndForget: true
    },

    create_clip: {
        address: "/live/clip_slot/create_clip",
        params: ["track_index", "clip_index", "length"],
        fireAndForget: true,
        defaults: {length: 4.0}
    },

    delete_clip: {
        address: "/live/clip_slot/delete_clip",
        params: ["track_index", "clip_index"],
        fireAndForget: true
    },

    set_clip_name: {
        address: "/live/clip/set/name",
        params: ["track_index", "clip_index", "name"],
        fireAndForget: true
    },

    set_clip_color: {
        address: "/live/clip/set/color",
        params: ["track_index", "clip_index", "color_index"],
        fireAndForget: true
    },

    duplicate_clip: {
        address: "/live/clip/duplicate_clip_to",
        params: ["source_track_index", "source_clip_index", "dest_track_index", "dest_clip_index"],
        fireAndForget: true
    },

    // Scene Operations
    list_scenes: {
        async handler() {
            const [numScenes] = await sendAndWait("/live/song/get/num_scenes");

            const scenes = [];
            for (let i = 0; i < numScenes; i++) {
                const [name] = await sendAndWait("/live/scene/get/name", i);
                scenes.push({
                    index: i,
                    name
                });
            }

            return {scenes};
        }
    },

    fire_scene: {
        address: "/live/scene/fire",
        params: ["scene_index"],
        fireAndForget: true
    },

    create_scene: {
        address: "/live/song/create_scene",
        params: ["index"],
        fireAndForget: true,
        defaults: {index: -1}
    },

    delete_scene: {
        address: "/live/song/delete_scene",
        params: ["scene_index"],
        fireAndForget: true
    },

    duplicate_scene: {
        address: "/live/scene/duplicate",
        params: ["scene_index"],
        fireAndForget: true
    },

    // Track Properties
    set_track_property: {
        async handler(args) {
            const {track_index, property, value} = args;

            const propertyMap = {
                volume: "/live/track/set/volume",
                pan: "/live/track/set/pan",
                mute: "/live/track/set/mute",
                solo: "/live/track/set/solo",
                arm: "/live/track/set/arm",
                name: "/live/track/set/name",
                color: "/live/track/set/color"
            };

            const address = propertyMap[property];
            if (!address) {
                throw new Error(`Unknown property: ${property}`);
            }

            // Convert boolean values to integers for OSC
            let oscValue = value;
            if (typeof value === "boolean") {
                oscValue = value ? 1 : 0;
            }

            fireAndForget(address, track_index, oscValue);
            return `Track ${track_index} ${property} set to ${value}`;
        }
    },

    // Clip Operations
    set_clip_loop: {
        async handler(args) {
            const {track_index, clip_index, loop_enabled, loop_start, loop_end} = args;

            if (loop_enabled !== undefined) {
                fireAndForget("/live/clip/set/looping", track_index, clip_index, loop_enabled ? 1 : 0);
            }
            if (loop_start !== undefined) {
                fireAndForget("/live/clip/set/loop_start", track_index, clip_index, loop_start);
            }
            if (loop_end !== undefined) {
                fireAndForget("/live/clip/set/loop_end", track_index, clip_index, loop_end);
            }

            return `Clip loop settings updated for track ${track_index}, clip ${clip_index}`;
        }
    },

    create_midi_note: {
        address: "/live/clip/add/notes",
        params: ["track_index", "clip_index", "pitch", "start_time", "duration", "velocity"],
        fireAndForget: true,
        defaults: {velocity: 100}
    },

    set_global_quantization: {
        async handler(args) {
            const quantMap = {
                "none": 0,
                "8_bars": 1,
                "4_bars": 2,
                "2_bars": 3,
                "1_bar": 4,
                "1/2": 5,
                "1/4": 6,
                "1/8": 7,
                "1/16": 8
            };

            const quantValue = quantMap[args.quantization];
            if (quantValue === undefined) {
                throw new Error(`Unknown quantization: ${args.quantization}`);
            }

            fireAndForget("/live/song/set/clip_trigger_quantization", quantValue);
            return `Global quantization set to ${args.quantization}`;
        }
    },

    // Track Creation/Deletion
    create_audio_track: {
        address: "/live/song/create_audio_track",
        params: ["index"],
        fireAndForget: true,
        defaults: {index: -1}
    },

    create_midi_track: {
        address: "/live/song/create_midi_track",
        params: ["index"],
        fireAndForget: true,
        defaults: {index: -1}
    },

    delete_track: {
        address: "/live/song/delete_track",
        params: ["track_index"],
        fireAndForget: true
    },

    // Arrangement View
    get_arrangement_view: {
        async handler() {
            const [loopEnabled] = await sendAndWait("/live/song/get/loop");
            const [loopStart] = await sendAndWait("/live/song/get/loop_start");
            const [loopLength] = await sendAndWait("/live/song/get/loop_length");

            return {
                loop_enabled: !!loopEnabled,
                loop_start: loopStart,
                loop_length: loopLength
            };
        }
    },

    set_arrangement_loop: {
        async handler(args) {
            const {enabled, start, length} = args;

            if (enabled !== undefined) {
                fireAndForget("/live/song/set/loop", enabled ? 1 : 0);
            }
            if (start !== undefined) {
                fireAndForget("/live/song/set/loop_start", start);
            }
            if (length !== undefined) {
                fireAndForget("/live/song/set/loop_length", length);
            }

            return "Arrangement loop settings updated";
        }
    },

    get_clip_length: {
        async handler(args) {
            const {track_index, clip_index} = args;
            const [length] = await sendAndWait("/live/clip/get/length", track_index, clip_index);
            const [numNumerator] = await sendAndWait("/live/song/get/time_signature_numerator");

            return {
                length_beats: length,
                length_bars: length / numNumerator
            };
        }
    },

    move_clip: {
        async handler(args) {
            const {source_track_index, source_clip_index, dest_track_index, dest_clip_index} = args;

            // AbletonOSC doesn't have a direct move, so we duplicate then delete source
            fireAndForget("/live/clip/duplicate_clip_to", source_track_index, source_clip_index, dest_track_index, dest_clip_index);
            // Small delay to ensure duplicate completes
            await new Promise(resolve => setTimeout(resolve, 100));
            fireAndForget("/live/clip_slot/delete_clip", source_track_index, source_clip_index);

            return `Moved clip from track ${source_track_index} slot ${source_clip_index} to track ${dest_track_index} slot ${dest_clip_index}`;
        }
    },

    get_all_clips_in_scene: {
        async handler(args) {
            const {scene_index} = args;
            const [numTracks] = await sendAndWait("/live/song/get/num_tracks");

            const clips = [];
            for (let trackIndex = 0; trackIndex < numTracks; trackIndex++) {
                const [hasClip] = await sendAndWait("/live/clip_slot/get/has_clip", trackIndex, scene_index);
                if (hasClip) {
                    const [name] = await sendAndWait("/live/clip/get/name", trackIndex, scene_index);
                    const [length] = await sendAndWait("/live/clip/get/length", trackIndex, scene_index);

                    clips.push({
                        track_index: trackIndex,
                        clip_index: scene_index,
                        name,
                        length
                    });
                }
            }

            return {clips};
        }
    }
};

// Utility functions
function fireAndForget(address, ...args) {
    if (TEST_MODE) return;
    osc.send(new OSC.Message(address, ...args));
}

function sendAndWait(address, ...args) {
    return new Promise((resolve, reject) => {
        let subscriptionId;

        const onTimeout = () => {
            if (subscriptionId !== undefined) {
                osc.off(address, subscriptionId);
            }
            reject(
                new Error(
                    `Timeout waiting for Ableton response on ${address}. ` +
                    `Check that Ableton Live is running with AbletonOSC enabled and ports are correct. ` +
                    `(host=${OSC_HOST}, send→${OSC_SEND_PORT}, recv←${OSC_RECV_PORT})`
                )
            );
        };

        const timeout = setTimeout(onTimeout, TIMEOUT_MS);

        const handler = (message) => {
            clearTimeout(timeout);
            if (subscriptionId !== undefined) {
                osc.off(address, subscriptionId);
            }
            resolve(message.args);
        };

        subscriptionId = osc.on(address, handler);
        osc.send(new OSC.Message(address, ...args));
    });
}

const toolText = (text) => ({
    content: [{
        type: "text",
        text: typeof text === "string" ? text : JSON.stringify(text, null, 2)
    }]
});
const toolError = (err) => ({
    content: [{type: "text", text: `Error: ${err?.message || String(err)}`}],
    isError: true,
});

// Generic tool handler
async function handleTool(toolName, args) {
    // Special case: health check
    if (toolName === "health_check") {
        return "ok";
    }

    const mapping = OSC_MAPPINGS[toolName];

    if (!mapping) {
        throw new Error(
            `Tool '${toolName}' is defined in ableton_mcp_tools.json but not yet implemented in the server. ` +
            `This tool requires custom OSC mapping logic to be added to the server.`
        );
    }

    // Custom handler function
    if (mapping.handler) {
        return await mapping.handler(args);
    }

    // Simple OSC address mapping
    if (mapping.address) {
        // Apply defaults
        const finalArgs = {...(mapping.defaults || {}), ...args};

        // Extract parameters in order
        const oscParams = (mapping.params || []).map(paramName => {
            const value = finalArgs[paramName];
            if (value === undefined && !mapping.defaults?.[paramName]) {
                throw new Error(`Missing required parameter: ${paramName}`);
            }
            return value;
        });

        if (mapping.fireAndForget) {
            fireAndForget(mapping.address, ...oscParams);
            return `Command sent: ${mapping.address}`;
        } else {
            const result = await sendAndWait(mapping.address, ...oscParams);
            return result;
        }
    }

    throw new Error(`Invalid mapping configuration for tool: ${toolName}`);
}

// Create MCP server
const server = new Server(
    {
        name: toolsConfig.server_name || "ableton-osc-mcp",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// List available tools - loaded from JSON
server.setRequestHandler(ListToolsRequestSchema, async () => {
    // Add health_check tool
    const healthCheck = {
        name: "health_check",
        description: "Simple health check that returns ok if the server is responsive",
        inputSchema: {type: "object", properties: {}, required: []}
    };

    // Convert tools from JSON format to MCP format
    const tools = (toolsConfig.tools || []).map(tool => ({
        name: tool.name,
        description: tool.description || "",
        inputSchema: tool.input_schema || {type: "object", properties: {}, required: []}
    }));

    return {tools: [healthCheck, ...tools]};
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
        const {name, arguments: args} = request.params;

        // In test mode, provide deterministic responses
        if (TEST_MODE) {
            if (name === "health_check") {
                return toolText("ok");
            }
            if (name === "get_tempo") {
                return toolText("Current tempo: 120 BPM");
            }
            // For other tools in test mode, return a success message
            return toolText(`Test mode: ${name} executed successfully`);
        }

        const result = await handleTool(name, args || {});
        return toolText(result);
    } catch (error) {
        return toolError(error);
    }
});

// Start server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Ableton Live MCP server running on stdio");
    console.error(`Loaded ${toolsConfig.tools?.length || 0} tools from ${TOOL_SPEC_PATH}`);
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
