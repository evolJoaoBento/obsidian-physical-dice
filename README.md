# Obsidian Physical Dice Plugin

A feature-rich 3D dice roller plugin for Obsidian with realistic physics simulation and multiplayer dice chat support. Roll dice with stunning 3D graphics, collaborate with other players, and enhance your tabletop RPG sessions directly within Obsidian.

![Plugin Demo](https://img.shields.io/badge/Obsidian-Plugin-purple)
![Version](https://img.shields.io/badge/version-1.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

### 🎲 Realistic 3D Dice Physics
- **Seven Dice Types**: d4, d6, d8, d10, d12, d20 and a percentile d100
- **True Physics Simulation**: Powered by Three.js and Cannon-es for realistic rolling, bouncing, and settling
- **Interactive Rolling**: Drag and throw dice with your mouse for natural rolling motion
- **Caught Dice Detection**: Automatically detects when dice land on edges or unstable positions
- **Reroll Functionality**: Easily reroll caught dice with visual feedback
- **Read Off The Die**: Every face carries the number the die reports, from the same table that placed the art, so the two cannot drift apart. A d4 is read at its apex, the way a real one is.
- **Bevelled Edges**: Edges taken off every die, with the rim's shading rounded so the light travels round the corner rather than breaking at it

### 💬 Multiplayer Dice Chat
- **DM/Player Roles**: Built-in role system for Dungeon Masters and Players
- **Real-time Dice Requests**: DMs can request specific dice rolls from players
- **Shared Results**: All dice rolls are broadcasted to the entire session
- **Room-based Sessions**: Create or join dice rolling sessions with unique room IDs
- **Chat Integration**: Send messages alongside dice rolls for context

### 🎨 Dice Packs
- **A Folder Is A Set**: Copy `dice/Texture-Pack-Default`, edit the art and its `pack.json`, pick it in the settings
- **The Pack Decides**: Face art, normal maps, colour, per-die size, finish, bevel, and how each net is laid out - all of it travels with the set
- **Retextures**: A die can borrow another's shape. The percentile die is a d10 with different numbers on it, and says so in one line
- **Documented**: See [dice/README.md](dice/README.md) for the format and the two tools that work a new pack out

### ⚙️ Customization & Settings
- **Motion Threshold**: Adjust sensitivity for dice settling detection
- **Shadow Effects**: Toggle realistic shadows for enhanced visual appeal
- **Dice Size**: Overall size of the set; the pack sets each die's size within it
- **Lighting**: Ambient and key light, colour and position
- **Result Animations**: Enable/disable result highlight animations
- **API Endpoint Configuration**: Connect to custom dice rolling servers

### 🔧 Technical Features
- **View Lifecycle Management**: Proper cleanup prevents background processes from running
- **WebGL Context Handling**: Automatic recovery from context loss
- **Optimized Rendering**: High-performance rendering with configurable quality settings
- **Copy to Clipboard**: Click any result to copy it instantly

## What's new in 1.1

- **Face art actually works.** A pack's sheets are masks rather than pictures,
  and were being tinted rather than composited - a red die came out a dark
  maroon square with a barely brighter numeral on it. Every die type now has its
  net mapped properly, so the number a die reports is the number printed on the
  face that is up.
- **A percentile d100**, as a retextured d10.
- **Bevelled edges** on every die, with the rim's shading rounded so light
  travels round the corner. Costs no extra geometry and can be turned off.
- **Dice packs.** A folder is a set: art, colour, sizes, finish, bevel and the
  layout of every net travel together in a `pack.json`. Copy the folder to make
  your own. The settings shrank from fifty-two rows to twenty-nine as a result -
  everything that describes the dice moved into the pack, and what is left
  describes the tray.
- **Blob shadows** in place of the shadow map, tuned per die type.
- The clickthrough toggle is gone; the canvas takes the pointer only while it is
  over a die and passes everything else to the note underneath.

## Installation

### From Obsidian Community Plugins (Recommended)
1. Open Obsidian Settings
2. Navigate to **Community Plugins**
3. Click **Browse** and search for "Physical Dice"
4. Click **Install** then **Enable**

### Manual Installation
1. Download the latest release from the [Releases page](https://github.com/evolJoaoBento/obsidian-physical-dice/releases)
2. Extract the files to your vault's plugins folder: `<vault>/.obsidian/plugins/dsix/`
3. Reload Obsidian
4. Enable the plugin in Settings → Community Plugins

### Build from Source
```bash
# Clone the repository
git clone https://github.com/evolJoaoBento/obsidian-physical-dice.git
cd obsidian-physical-dice

# Install dependencies
npm install

# Build the plugin
npm run build

# Copy files to your vault
cp main.js manifest.json styles.css <vault>/.obsidian/plugins/dsix/
```

## Usage

### Quick Start: Rolling Dice

1. **Open Dice Interface**: Click the dice icon in the left ribbon or use command palette (`Ctrl/Cmd + P`) and search for "Show Dice Roller"
2. **Select Dice**: Click the dice type buttons to add dice to your tray
3. **Roll**:
   - Click the **Roll** button
   - Or drag a dice with your mouse and throw it
4. **View Results**: Results appear at the top of the interface and can be clicked to copy

### Using the Dice Chat

#### As a Dungeon Master (DM)

1. **Open Dice Chat**: Use command palette → "Open Dice Chat"
2. **Enter Your Details**:
   - Username: Your name
   - Role: Select "DM"
   - Session ID: Leave blank to create a new session (or enter existing session ID)
3. **Share Session ID**: Give the session ID to your players
4. **Request Rolls**:
   - Select dice (e.g., 2d6 + 1d20 + 3)
   - Click "Request Dice Roll"
   - Players will see the request and can fulfill it with one click

#### As a Player

1. **Open Dice Chat**: Use command palette → "Open Dice Chat"
2. **Enter Your Details**:
   - Username: Your name
   - Role: Select "Player"
   - Session ID: Enter the session ID provided by your DM
3. **Respond to Requests**: Click on any dice request to automatically load those dice
4. **Roll**: Click "Roll Dice" to send results to everyone

### Dice Expression Format

The plugin supports standard dice notation:
- `1d20` - Single d20
- `2d6` - Two six-sided dice
- `1d20+5` - d20 with +5 modifier
- `2d6+1d4-2` - Multiple dice with modifier
- `3d8+2d6+10` - Complex combinations

## Configuration

### Plugin Settings

Access settings via **Settings → Community Plugins → Physical Dice**

| Setting | Description | Default |
|---------|-------------|---------|
| **API Endpoint** | Server URL for multiplayer dice chat | `http://localhost:5000` |
| **Motion Threshold** | Sensitivity for dice settling (lower = more sensitive) | `1.0` |
| **Enable Shadows** | Render realistic shadows (impacts performance) | `true` |
| **Dice pack** | Folder under `dice/` holding the set | `Texture-Pack-Default` |
| **Dice Size** | Overall size of the set | `0.8` |
| **Enable Result Animation** | Highlight completed dice | `true` |

Anything about the dice themselves - their colour, each one's size, their
finish, whether their edges are bevelled, and how the art is laid out on them -
lives in the pack rather than here. See [dice/README.md](dice/README.md).

### Server Setup (Optional)

For multiplayer functionality, you'll need a dice rolling server. The plugin includes a Flask-based server:

```bash
# Install Python dependencies
pip install flask flask-cors flask-socketio

# Run the server
python dice_server.py
```

Server runs on `http://localhost:5000` by default.

#### Environment Variables
```bash
# .env file
FLASK_ENV=development
SECRET_KEY=your-secret-key-here
DATABASE_URL=sqlite:///dice.db
```

## API Documentation

### REST Endpoints

#### Health Check
```http
GET /api/dice/health
```
Returns server status.

#### Roll Dice
```http
POST /api/dice/roll
Content-Type: application/json

{
  "expression": "2d6+3",
  "description": "Attack roll"
}
```

Response:
```json
{
  "total": 11,
  "breakdown": "2d6(3,5) + 3",
  "timestamp": "2025-01-27T10:30:00Z"
}
```

#### Send Dice Request (DM only)
```http
POST /api/dice/requests
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "expression": "1d20+5",
  "description": "Perception check"
}
```

### WebSocket Events

#### Join Session
```javascript
socket.emit('join_session', {
  sessionId: 'abc123',
  username: 'PlayerName',
  role: 'player'
});
```

#### Dice Request Notification
```javascript
socket.on('dice_request', (data) => {
  console.log(data.expression); // "2d6+3"
  console.log(data.requester); // "DM_Name"
});
```

## Development

### Project Structure
```
dsix/
├── src/
│   ├── main.ts              # Plugin entry point
│   ├── d20-dice.ts          # Core dice engine with Three.js/Cannon-es
│   ├── dice-view.ts         # Simple dice roller view
│   ├── chat-view.ts         # Multiplayer chat view
│   ├── chat-modal.ts        # Chat modal component
│   ├── api-client.ts        # API client for server communication
│   ├── settings.ts          # Plugin settings
│   └── types.ts             # TypeScript type definitions
├── dice/                    # Dice packs: art plus a pack.json describing the set
│   └── README.md            # Pack format
├── harness/                 # Drives the real Obsidian over CDP
│   └── scripts/             # smoke.js, net.js, overlay.js, calibrate.js
├── styles.css               # Plugin styles
├── manifest.json            # Plugin manifest
├── package.json             # NPM dependencies
└── tsconfig.json            # TypeScript configuration
```

### Building

```bash
# Development build (with watching)
npm run dev

# Production build
npm run build

# Type checking only
npx tsc --noEmit
```

### Dependencies

**Core:**
- `obsidian` - Obsidian API
- `three` - 3D rendering engine
- `cannon-es` - Physics simulation

**Build Tools:**
- `typescript` - Type system
- `esbuild` - Fast bundler
- `@types/node` - Node.js types

### Code Architecture

#### D20Dice Class
The core dice engine manages:
- 3D scene setup and rendering
- Physics world simulation
- Dice mesh creation and texturing
- Roll detection and result calculation
- Caught dice identification
- Animation loops and lifecycle management

**Key Methods:**
- `roll()` - Initiate a dice roll
- `createSingleDice(type)` - Add a dice to the scene
- `rerollCaughtDice()` - Reroll detected caught dice
- `destroy()` - Clean up resources

#### View Lifecycle
The plugin properly manages view lifecycle:
1. `onOpen()` - Initialize dice engine and UI
2. `isViewActive` flag - Tracks if view is open
3. `onClose()` - Sets flag to false, stops all loops
4. `destroy()` - Cleans up Three.js and Cannon-es resources

#### Animation Loop Safety
All loops check `isViewActive`:
```typescript
private animate() {
    if (!this.isViewActive) {
        console.log('🛑 Animation stopped');
        return;
    }
    requestAnimationFrame(() => this.animate());
    // ... rendering code
}
```

## Troubleshooting

### Common Issues

**Dice won't stop rolling**
- Solution: Close and reopen the dice interface. Recent updates ensure all loops stop properly.

**WebGL context lost**
- The plugin automatically recovers from context loss
- If issues persist, restart Obsidian

**Caught dice not detected**
- Adjust Motion Threshold in settings (lower = more sensitive)
- Caught dice show no highlight and display a message in console

**Multiplayer not working**
- Ensure the dice server is running
- Check API Endpoint in settings matches server URL
- Verify firewall isn't blocking port 5000

**Performance issues**
- Disable shadows in settings
- Reduce dice size
- Close other resource-intensive plugins

### Debug Mode

Enable debug logs in the browser console:
1. Open Developer Tools (`Ctrl+Shift+I` / `Cmd+Option+I`)
2. Go to Console tab
3. Look for messages prefixed with:
   - `🎲` - Dice events
   - `🎯` - Physics debug
   - `🛑` - Cleanup events
   - `⏸️` - Waiting states

## Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes**
4. **Test thoroughly**: Ensure dice rolling, chat, and lifecycle work correctly
5. **Commit with clear messages**: Follow [Conventional Commits](https://www.conventionalcommits.org/)
6. **Push to your fork**: `git push origin feature/amazing-feature`
7. **Open a Pull Request**

### Development Guidelines
- Use TypeScript for type safety
- Follow existing code style
- Add comments for complex logic
- Test on multiple platforms (Windows, Mac, Linux)
- Ensure proper cleanup in `destroy()` methods

## Credits

### Libraries
- [Three.js](https://threejs.org/) - 3D rendering
- [Cannon-es](https://github.com/pmndrs/cannon-es) - Physics simulation
- [Obsidian API](https://github.com/obsidianmd/obsidian-api) - Plugin framework

### Assets
- Dice textures created for this project
- Inspired by various online dice rolling implementations

### Contributors
- João Bento ([@evolJoaoBento](https://github.com/evolJoaoBento)) - Original author
- Claude (Anthropic) - Code assistance and documentation

## License

MIT License

Copyright (c) 2025 João Bento

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Support

- **Issues**: [GitHub Issues](https://github.com/evolJoaoBento/obsidian-physical-dice/issues)
- **Discussions**: [GitHub Discussions](https://github.com/evolJoaoBento/obsidian-physical-dice/discussions)
- **Documentation**: This README and inline code comments

---

**Enjoy rolling dice in Obsidian!** 🎲✨

If you find this plugin helpful, please consider:
- ⭐ Starring the repository
- 🐛 Reporting bugs and suggesting features
- 🤝 Contributing code improvements
- 📢 Sharing with the Obsidian community
