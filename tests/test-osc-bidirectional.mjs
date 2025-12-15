#!/usr/bin/env node
// Standalone OSC bidirectional communication test
// This script tests if we can send a GET request to AbletonOSC and receive a response

import OSC from "osc-js";

const OSC_HOST = process.env.ABLETON_OSC_HOST || "127.0.0.1";
const OSC_PORT = Number(process.env.ABLETON_OSC_PORT) || 11000;
const OSC_RESPONSE_PORT = Number(process.env.ABLETON_OSC_RESPONSE_PORT) || 11001;
const TIMEOUT_MS = 10000; // 10 second timeout for testing

console.log(`\n=== OSC Bidirectional Communication Test ===`);
console.log(`Sending to: ${OSC_HOST}:${OSC_PORT}`);
console.log(`Receiving on: port ${OSC_RESPONSE_PORT}`);
console.log(`Timeout: ${TIMEOUT_MS}ms\n`);

// Create OSC client with explicit configuration
// IMPORTANT: AbletonOSC sends responses to port 11001, not back to source port!
const osc = new OSC({
    plugin: new OSC.DatagramPlugin({
        open: {
            host: "0.0.0.0",           // Listen on all interfaces
            port: OSC_RESPONSE_PORT,   // MUST match AbletonOSC's response port
            exclusive: false            // Allow port reuse
        },
        send: {
            host: OSC_HOST,      // Send to AbletonOSC
            port: OSC_PORT       // On port 11000
        },
    }),
});

// Track what we receive
let receivedMessages = [];

// Log all incoming OSC messages
osc.on("*", (message) => {
    console.log("📨 Received OSC message:", {
        address: message.address,
        args: message.args,
        timestamp: new Date().toISOString()
    });
    receivedMessages.push(message);
});

// Log socket open event
osc.on("open", () => {
    console.log("✅ OSC socket opened successfully");
    const socket = osc.plugin.socket;
    if (socket && socket.address) {
        const addr = socket.address();
        console.log(`   Local socket bound to: ${addr.address}:${addr.port}`);
    }
});

// Log errors
osc.on("error", (err) => {
    console.error("❌ OSC error:", err);
});

// Helper to send and wait for response
function sendAndWait(address, ...args) {
    return new Promise((resolve, reject) => {
        console.log(`\n📤 Sending OSC message: ${address}`, args.length > 0 ? args : "");

        let subscriptionId;
        const timeout = setTimeout(() => {
            if (subscriptionId !== undefined) {
                osc.off(address, subscriptionId);
            }
            reject(new Error(`Timeout waiting for response on ${address} after ${TIMEOUT_MS}ms`));
        }, TIMEOUT_MS);

        const handler = (message) => {
            console.log(`📥 Got response on ${address}:`, message.args);
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

// Helper to send fire-and-forget
function fireAndForget(address, ...args) {
    console.log(`\n🔥 Sending fire-and-forget: ${address}`, args.length > 0 ? args : "");
    osc.send(new OSC.Message(address, ...args));
}

async function runTests() {
    try {
        // Open the OSC connection
        await osc.open();
        console.log("\nWaiting 1 second for socket to stabilize...");
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Test 1: Fire and forget (write operation - should work)
        console.log("\n--- Test 1: Fire-and-forget (set tempo) ---");
        fireAndForget("/live/song/set/tempo", 120);
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log("✅ Fire-and-forget sent (check Ableton to verify tempo changed)");

        // Test 2: Request-response (read operation - the problematic one)
        console.log("\n--- Test 2: Request-response (get num tracks) ---");
        try {
            const [numTracks] = await sendAndWait("/live/song/get/num_tracks");
            console.log(`✅ SUCCESS! Received num_tracks: ${numTracks}`);
        } catch (err) {
            console.error(`❌ FAILED: ${err.message}`);
            console.log("\nDiagnostics:");
            console.log(`- Total messages received: ${receivedMessages.length}`);
            if (receivedMessages.length > 0) {
                console.log("- Received message addresses:", receivedMessages.map(m => m.address));
            }
        }

        // Test 3: Another read operation
        console.log("\n--- Test 3: Request-response (get tempo) ---");
        try {
            const [tempo] = await sendAndWait("/live/song/get/tempo");
            console.log(`✅ SUCCESS! Received tempo: ${tempo}`);
        } catch (err) {
            console.error(`❌ FAILED: ${err.message}`);
        }

        console.log("\n--- Test Summary ---");
        console.log(`Total OSC messages received: ${receivedMessages.length}`);
        if (receivedMessages.length > 0) {
            console.log("Received addresses:");
            receivedMessages.forEach((msg, i) => {
                console.log(`  ${i + 1}. ${msg.address} -> ${JSON.stringify(msg.args)}`);
            });
        } else {
            console.log("⚠️  NO RESPONSES RECEIVED - This indicates a problem with receiving OSC messages");
        }

    } catch (error) {
        console.error("\n❌ Test failed with error:", error);
    } finally {
        console.log("\nClosing OSC connection...");
        osc.close();
        // Give it a moment to close gracefully
        setTimeout(() => {
            console.log("Done.\n");
            process.exit(0);
        }, 500);
    }
}

// Start tests
runTests();
