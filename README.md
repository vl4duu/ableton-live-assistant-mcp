# Ableton Live Assistant

Control Ableton Live with GPT-4 using natural language commands.

## Setup Complete ✓

### What has been installed:

1. **Node.js Project** - Created with required dependencies:
   - `dotenv` - For loading OpenAI API key
   - `openai` - For GPT-4 API access
   - `osc-js` - For sending OSC commands to Ableton Live

2. **AbletonOSC** - Remote script installed to:
   - `~/Music/Ableton/User Library/Remote Scripts/AbletonOSC`

3. **Project Files**:
   - `.env` - Environment file for your OpenAI API key
   - `.gitignore` - Prevents sensitive files from being committed
   - `index.mjs` - Main application file

## Next Steps:

### 1. Add your OpenAI API Key

Edit the `.env` file and replace `your-api-key` with your actual OpenAI API key:

```bash
OPENAI_API_KEY=sk-...
```

To get an API key, visit: https://platform.openai.com/api-keys

### 2. Configure Ableton Live

1. **Start Ableton Live** (requires Live 11 or above)
2. Open **Preferences** → **Link / Tempo / MIDI**
3. Under **Control Surface**, select **AbletonOSC** from the dropdown
4. You should see a message: "AbletonOSC: Listening for OSC on port 11000"

### 3. Test the Setup

Run the example code to test OpenAI connection:

```bash
node index.mjs
```

If everything is working, you should see a response from GPT-4.

## How it works:

- **AbletonOSC** listens on port **11000** for incoming OSC messages
- **AbletonOSC** sends replies on port **11001**
- Your Node.js app sends commands via OSC and receives responses
- GPT-4 translates natural language into OSC commands

## Troubleshooting:

- If AbletonOSC doesn't appear in Ableton's Control Surface dropdown, restart Ableton Live
- Check logs at: `~/Music/Ableton/User Library/Remote Scripts/AbletonOSC/logs/`
- Make sure you're using Ableton Live 11 or above

## Resources:

- [AbletonOSC Documentation](https://github.com/ideoforms/AbletonOSC)
- [OpenAI API Documentation](https://platform.openai.com/docs)
