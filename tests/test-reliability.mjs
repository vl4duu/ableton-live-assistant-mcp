#!/usr/bin/env node
// Comprehensive reliability test for OSC communication
// Tests various scenarios that might cause unreliability

import OSC from "osc-js";

const OSC_HOST = process.env.ABLETON_OSC_HOST || "127.0.0.1";
const OSC_PORT = Number(process.env.ABLETON_OSC_PORT) || 11000;
const OSC_RESPONSE_PORT = Number(process.env.ABLETON_OSC_RESPONSE_PORT) || 11001;
const TIMEOUT_MS = 5000;

console.log(`\n=== OSC Reliability Test ===`);
console.log(`Config: ${OSC_HOST}:${OSC_PORT} -> response port ${OSC_RESPONSE_PORT}`);
console.log(`Timeout: ${TIMEOUT_MS}ms\n`);

// Create OSC client
const osc = new OSC({
    plugin: new OSC.DatagramPlugin({
        open: {
            host: "0.0.0.0",
            port: OSC_RESPONSE_PORT,
            exclusive: false
        },
        send: {
            host: OSC_HOST,
            port: OSC_PORT
        },
    }),
});

let messageCount = 0;
let errorCount = 0;

// Track all messages
osc.on("*", (message) => {
    messageCount++;
    console.log(`  📨 [${messageCount}] ${message.address}: ${JSON.stringify(message.args)}`);
});

// Track errors
osc.on("error", (err) => {
    errorCount++;
    console.error(`  ❌ OSC Error [${errorCount}]:`, err.message);
});

osc.on("open", () => {
    console.log("✅ OSC socket opened\n");
});

function sendAndWait(address, ...args) {
    return new Promise((resolve, reject) => {
        let subscriptionId;
        const timeout = setTimeout(() => {
            if (subscriptionId !== undefined) {
                osc.off(address, subscriptionId);
            }
            reject(new Error(`Timeout on ${address} after ${TIMEOUT_MS}ms`));
        }, TIMEOUT_MS);

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

async function test1_SocketReadyRace() {
    console.log("--- Test 1: Socket Ready Race Condition ---");
    console.log("Testing if requests sent immediately after open() fail...\n");

    try {
        // Open and immediately send without waiting
        await osc.open();
        const [tempo] = await sendAndWait("/live/song/get/tempo");
        console.log(`✅ Immediate request after open() succeeded: tempo=${tempo}\n`);
        return true;
    } catch (err) {
        console.error(`❌ Immediate request failed: ${err.message}`);
        console.error("   → This suggests socket not ready immediately after open()\n");
        return false;
    }
}

async function test2_SequentialRequests() {
    console.log("--- Test 2: Sequential Requests ---");
    console.log("Testing multiple requests one after another...\n");

    const tests = [
        { address: "/live/song/get/tempo", name: "tempo" },
        { address: "/live/song/get/num_tracks", name: "num_tracks" },
        { address: "/live/song/get/is_playing", name: "is_playing" },
        { address: "/live/song/get/loop_start", name: "loop_start" },
        { address: "/live/song/get/loop_length", name: "loop_length" }
    ];

    let successCount = 0;
    let failCount = 0;

    for (const test of tests) {
        try {
            const [result] = await sendAndWait(test.address);
            console.log(`  ✅ ${test.name}: ${result}`);
            successCount++;
        } catch (err) {
            console.error(`  ❌ ${test.name}: ${err.message}`);
            failCount++;
        }
    }

    console.log(`\nSequential: ${successCount}/${tests.length} succeeded, ${failCount} failed\n`);
    return failCount === 0;
}

async function test3_ConcurrentRequests() {
    console.log("--- Test 3: Concurrent Requests ---");
    console.log("Testing multiple requests fired simultaneously...\n");

    const requests = [
        sendAndWait("/live/song/get/tempo"),
        sendAndWait("/live/song/get/num_tracks"),
        sendAndWait("/live/song/get/is_playing"),
        sendAndWait("/live/song/get/loop_start"),
        sendAndWait("/live/song/get/loop_length")
    ];

    try {
        const results = await Promise.all(requests);
        console.log(`✅ All ${results.length} concurrent requests succeeded`);
        console.log(`   Results: ${JSON.stringify(results.map(r => r[0]))}\n`);
        return true;
    } catch (err) {
        console.error(`❌ Concurrent requests failed: ${err.message}\n`);
        return false;
    }
}

async function test4_RapidFireRequests() {
    console.log("--- Test 4: Rapid-fire Requests (stress test) ---");
    console.log("Sending 10 requests as fast as possible...\n");

    const promises = [];
    for (let i = 0; i < 10; i++) {
        promises.push(sendAndWait("/live/song/get/tempo"));
    }

    try {
        const results = await Promise.all(promises);
        console.log(`✅ All 10 rapid-fire requests succeeded\n`);
        return true;
    } catch (err) {
        console.error(`❌ Rapid-fire test failed: ${err.message}\n`);
        return false;
    }
}

async function test5_WithDelayAfterOpen() {
    console.log("--- Test 5: With Delay After Open ---");
    console.log("Closing, reopening with 1s delay, then testing...\n");

    try {
        osc.close();
        await new Promise(resolve => setTimeout(resolve, 100));
        await osc.open();
        console.log("  Waiting 1 second for socket to stabilize...");
        await new Promise(resolve => setTimeout(resolve, 1000));

        const [tempo] = await sendAndWait("/live/song/get/tempo");
        console.log(`✅ Request with delay succeeded: tempo=${tempo}\n`);
        return true;
    } catch (err) {
        console.error(`❌ Request with delay failed: ${err.message}\n`);
        return false;
    }
}

async function test6_EventHandlerLeaks() {
    console.log("--- Test 6: Event Handler Cleanup ---");
    console.log("Testing if event handlers are properly cleaned up...\n");

    const beforeCount = osc.eventHandler.events.size || 0;
    console.log(`  Event handlers before test: ${beforeCount}`);

    // Make several requests
    for (let i = 0; i < 5; i++) {
        try {
            await sendAndWait("/live/song/get/tempo");
        } catch (err) {
            // Ignore failures
        }
    }

    const afterCount = osc.eventHandler.events.size || 0;
    console.log(`  Event handlers after test: ${afterCount}`);

    if (afterCount > beforeCount + 2) {
        console.error(`  ❌ WARNING: Event handlers may be leaking (grew by ${afterCount - beforeCount})\n`);
        return false;
    } else {
        console.log(`  ✅ Event handlers properly cleaned up\n`);
        return true;
    }
}

async function runAllTests() {
    const results = {
        test1_SocketReadyRace: false,
        test2_SequentialRequests: false,
        test3_ConcurrentRequests: false,
        test4_RapidFireRequests: false,
        test5_WithDelayAfterOpen: false,
        test6_EventHandlerLeaks: false
    };

    try {
        results.test1_SocketReadyRace = await test1_SocketReadyRace();
        results.test2_SequentialRequests = await test2_SequentialRequests();
        results.test3_ConcurrentRequests = await test3_ConcurrentRequests();
        results.test4_RapidFireRequests = await test4_RapidFireRequests();
        results.test5_WithDelayAfterOpen = await test5_WithDelayAfterOpen();
        results.test6_EventHandlerLeaks = await test6_EventHandlerLeaks();

    } catch (error) {
        console.error("\n❌ Test suite crashed:", error);
    }

    console.log("\n=== TEST SUMMARY ===");
    let passCount = 0;
    let totalCount = 0;

    for (const [testName, passed] of Object.entries(results)) {
        totalCount++;
        if (passed) passCount++;
        const icon = passed ? "✅" : "❌";
        console.log(`${icon} ${testName.replace(/_/g, ' ')}: ${passed ? "PASS" : "FAIL"}`);
    }

    console.log(`\n${passCount}/${totalCount} tests passed`);
    console.log(`Total messages received: ${messageCount}`);
    console.log(`Total errors: ${errorCount}`);

    osc.close();

    setTimeout(() => {
        process.exit(passCount === totalCount ? 0 : 1);
    }, 500);
}

runAllTests();
