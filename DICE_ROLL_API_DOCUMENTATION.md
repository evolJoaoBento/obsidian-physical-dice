# Dice Roll API Documentation

## Overview

The Dice Roll API provides a comprehensive dice rolling system for tabletop RPG applications. It supports complex dice notation, roll history, templates, and statistics tracking. The API can run as part of the main Hexcrawl server or as a standalone microservice.

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Client Apps    │────▶│  Dice API    │────▶│   Databases     │
│ (Obsidian, Web) │     │  /api/dice   │     │ - Auth (shared) │
└─────────────────┘     └──────────────┘     │ - Dice Rolls    │
                                              └─────────────────┘
```

### Components

- **Dice Engine** (`dice/engine.py`): Core rolling logic and expression parser
- **API Routes** (`dice/routes.py`): REST endpoints for all dice operations
- **Database Models** (`dice/models.py`): SQLAlchemy models for persistence
- **Chat System** (`dice/simple_chat_routes.py`, `dice/simple_chat_models.py`): Integrated chat for DM-Player communication
- **Request System** (`dice/request_routes.py`, `dice/request_models.py`): Advanced dice request/response workflow
- **Frontend Components** (`dice/frontend/`): Complete UI for dice rolling and chat
- **Standalone Server** (`dice_server.py`): Independent microservice option

## Running the API

### As Part of Main Server

The dice API is automatically loaded when running the main Hexcrawl server:

```bash
python app.py
```

Access at: `http://localhost:5000/api/dice`

### Simple Dice Chat Interface

For testing and demonstration, a complete dice chat interface is available:

```bash
# Start the server
python app.py
# Or use the batch file
start_dice_chat.bat
```

Access the demo at: `http://localhost:5000/dice-chat`

**Features:**
- Dual-panel interface (DM and Player)
- Visual dice selection (d4, d6, d8, d10, d12, d20)
- Clickable dice requests
- Real-time chat integration
- Automatic dice result display

### As Standalone Server

Run the dice API as an independent service:

```bash
python dice_server.py
```

Default port: 5001
Access at: `http://localhost:5001/api/dice`

### Environment Variables

```bash
# .env file
JWT_SECRET=your-secret-key-here
DICE_SERVER_PORT=5001  # For standalone server
AUTH_DATABASE_URL=sqlite:///auth.db  # Shared auth database
```

## Simple Chat API Integration

The dice system includes a simplified chat interface designed for DM-Player interactions:

### Chat Endpoints

**Base URL:** `/api/chat/`

#### Join Room
**Endpoint:** `POST /api/chat/rooms/{room_id}/join`
**Authentication:** Optional

```json
{
    "username": "GameMaster",
    "user_role": "dm"
}
```

#### Send Message
**Endpoint:** `POST /api/chat/rooms/{room_id}/messages`
**Authentication:** Optional

```json
{
    "content": "Roll for initiative!",
    "username": "GameMaster",
    "user_role": "dm"
}
```

#### Get Messages
**Endpoint:** `GET /api/chat/rooms/{room_id}/messages`
**Authentication:** Optional

Returns combined chat and dice result messages.

## Authentication

The API uses JWT Bearer tokens for authentication. Some endpoints require authentication, while others are optional or public.

### Token Format

```
Authorization: Bearer <jwt-token>
```

### Authentication Levels

- **None**: No authentication required (parse, health, chat)
- **Optional**: Works with or without auth (roll, history)
- **Required**: Must be authenticated (statistics, create templates)

## API Endpoints

### 1. Roll Dice

**Endpoint:** `POST /api/dice/roll`
**Authentication:** Optional

Roll dice based on an expression.

**Request Body:**
```json
{
    "expression": "3d6+2",
    "description": "Attack roll",
    "advantage": false,
    "disadvantage": false,
    "campaign_id": "campaign-123",
    "session_id": "session-456"
}
```

**Response:**
```json
{
    "id": 1,
    "expression": "3d6+2",
    "raw_rolls": {
        "3d6": [4, 3, 5]
    },
    "modifiers": [["+", 2]],
    "total": 14,
    "is_critical": false,
    "is_fumble": false,
    "breakdown": "3d6=[4,3,5]=12 +2 = 14"
}
```

### 2. Bulk Roll

**Endpoint:** `POST /api/dice/roll/bulk`
**Authentication:** Optional

Roll the same expression multiple times.

**Request Body:**
```json
{
    "expression": "d20",
    "count": 5,
    "description": "Initiative rolls"
}
```

**Response:**
```json
{
    "count": 5,
    "expression": "d20",
    "results": [
        {"id": 1, "total": 15, "breakdown": "d20=[15]=15 = 15"},
        {"id": 2, "total": 8, "breakdown": "d20=[8]=8 = 8"},
        {"id": 3, "total": 20, "breakdown": "d20=[20]=20 = 20"},
        {"id": 4, "total": 3, "breakdown": "d20=[3]=3 = 3"},
        {"id": 5, "total": 11, "breakdown": "d20=[11]=11 = 11"}
    ],
    "summary": {
        "total": 57,
        "average": 11.4,
        "min": 3,
        "max": 20
    }
}
```

### 3. Roll History

**Endpoint:** `GET /api/dice/history`
**Authentication:** Optional

Get roll history. Shows user's rolls if authenticated, recent public rolls otherwise.

**Query Parameters:**
- `limit` (integer, max 100, default 50)
- `offset` (integer, default 0)
- `campaign_id` (string, optional)

**Response:**
```json
{
    "rolls": [
        {
            "id": 1,
            "expression": "3d6+2",
            "total": 14,
            "timestamp": "2024-01-25T10:30:00",
            "description": "Attack roll",
            "is_critical": false,
            "is_fumble": false
        }
    ],
    "count": 1,
    "offset": 0
}
```

### 4. User Statistics

**Endpoint:** `GET /api/dice/statistics`
**Authentication:** Required

Get aggregated statistics for the authenticated user.

**Response:**
```json
{
    "stats": {
        "user_id": 1,
        "total_rolls": 156,
        "total_d20_rolls": 45,
        "critical_count": 3,
        "fumble_count": 2,
        "average_roll": 10.5,
        "highest_roll": 38,
        "lowest_roll": 1,
        "dice_distribution": {
            "d20": 45,
            "d6": 87,
            "d10": 24
        },
        "last_updated": "2024-01-25T10:30:00"
    }
}
```

### 5. Templates

#### Get Templates

**Endpoint:** `GET /api/dice/templates`
**Authentication:** Optional

Get roll templates (user's private + public).

**Response:**
```json
{
    "templates": [
        {
            "id": 1,
            "name": "Longsword Attack",
            "expression": "d20+5",
            "description": "Attack with longsword",
            "category": "attack",
            "is_public": true
        }
    ]
}
```

#### Create Template

**Endpoint:** `POST /api/dice/templates`
**Authentication:** Required

Create a new roll template.

**Request Body:**
```json
{
    "name": "Fireball Damage",
    "expression": "8d6",
    "description": "Damage for fireball spell",
    "category": "spell",
    "is_public": false
}
```

#### Delete Template

**Endpoint:** `DELETE /api/dice/templates/{id}`
**Authentication:** Required

Delete a template owned by the user.

#### Roll with Template

**Endpoint:** `POST /api/dice/templates/{id}/roll`
**Authentication:** Optional

Roll using a saved template.

**Request Body:**
```json
{
    "advantage": false,
    "disadvantage": false,
    "campaign_id": "campaign-123"
}
```

### 6. Parse Expression

**Endpoint:** `POST /api/dice/parse`
**Authentication:** None

Parse and validate a dice expression without rolling.

**Request Body:**
```json
{
    "expression": "3d6+2d8+5"
}
```

**Response:**
```json
{
    "expression": "3d6+2d8+5",
    "dice": [
        {"count": 3, "sides": 6, "notation": "3d6"},
        {"count": 2, "sides": 8, "notation": "2d8"}
    ],
    "modifiers": [
        {"sign": "+", "value": 5}
    ],
    "is_valid": true
}
```

### 7. Health Check

**Endpoint:** `GET /api/dice/health`
**Authentication:** None

Check API health status.

**Response:**
```json
{
    "status": "healthy",
    "service": "dice-api"
}
```

## Dice Notation Support

### Basic Notation

- **Simple rolls:** `d20`, `3d6`, `2d10`
- **With modifiers:** `3d6+2`, `d20-1`, `2d8+1d6+3`

### Advanced Features

#### Keep/Drop
- `4d6kh3` - Roll 4d6, keep highest 3
- `4d6kl3` - Roll 4d6, keep lowest 3
- `2d20kh1` - Roll 2d20, keep highest 1 (advantage)
- `2d20kl1` - Roll 2d20, keep lowest 1 (disadvantage)

#### Reroll
- `4d6r1` - Roll 4d6, reroll 1s once
- `3d6r2` - Roll 3d6, reroll 2s and below

#### Exploding
- `3d6!` - Roll 3d6, explode on max (6)
- `d10!` - Roll d10, explode on 10

### Complex Expressions

```
3d6+2d8+5           # Multiple dice types with modifier
4d6kh3+2            # Keep highest with modifier
2d20kh1+5           # Advantage with modifier
3d6!+1d4            # Exploding dice with additional roll
```

## Database Schema

### DiceRoll Table

| Column | Type | Description |
|--------|------|-------------|
| id | Integer | Primary key |
| user_id | Integer | User ID (nullable) |
| username | String | Cached username |
| expression | String | Dice expression |
| description | Text | Optional description |
| raw_rolls | JSON | Individual dice results |
| modifiers | JSON | Applied modifiers |
| total | Integer | Final result |
| timestamp | DateTime | Roll timestamp |
| source | String | api/web/plugin |
| campaign_id | String | Campaign context |
| session_id | String | Session context |
| is_critical | Boolean | Natural 20 on d20 |
| is_fumble | Boolean | Natural 1 on d20 |
| advantage | Boolean | Rolled with advantage |
| disadvantage | Boolean | Rolled with disadvantage |

### RollTemplate Table

| Column | Type | Description |
|--------|------|-------------|
| id | Integer | Primary key |
| user_id | Integer | Owner user ID |
| name | String | Template name |
| expression | String | Dice expression |
| description | Text | Template description |
| category | String | Category (attack/save/skill) |
| is_public | Boolean | Public visibility |
| created_at | DateTime | Creation timestamp |

### RollStatistics Table

| Column | Type | Description |
|--------|------|-------------|
| id | Integer | Primary key |
| user_id | Integer | User ID (unique) |
| total_rolls | Integer | Total roll count |
| total_d20_rolls | Integer | D20 roll count |
| critical_count | Integer | Natural 20 count |
| fumble_count | Integer | Natural 1 count |
| average_roll | Float | Average result |
| highest_roll | Integer | Highest result |
| lowest_roll | Integer | Lowest result |
| dice_distribution | JSON | Dice type usage |
| last_updated | DateTime | Last update time |

## Error Responses

All errors follow this format:

```json
{
    "error": "Error description"
}
```

### Common Error Codes

- **400**: Invalid request or expression
- **401**: Authentication required
- **403**: Access denied
- **404**: Resource not found
- **429**: Rate limit exceeded
- **500**: Internal server error

## Rate Limiting

Default limits:
- 100 requests per minute
- 1000 requests per hour

Rate limit headers are included in responses:
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

## Integration Examples

### Simple Dice Chat Interface Integration

```javascript
// Initialize the dice chat interface
const container = document.getElementById('chat-container');
const diceChat = new SimpleDiceChatInterface(container, {
    apiBaseUrl: 'http://localhost:5000',
    userRole: 'player'  // or 'dm'
});

// Connect to a room
diceChat.connect('PlayerName', 'player');

// The interface handles:
// - Visual dice selection (d4-d20)
// - Clickable dice requests
// - Real-time message updates
// - Automatic result display
```

### Dice Request Workflow

```javascript
// DM creates a dice request
const dmChat = new SimpleDiceChatInterface(dmContainer, {
    userRole: 'dm'
});

// DM selects dice (2d6+1d20+3) and clicks "Request Dice Roll"
// System sends formatted request message

// Player sees clickable request message
const playerChat = new SimpleDiceChatInterface(playerContainer, {
    userRole: 'player'
});

// Player clicks the dice request message
// Modal opens with pre-populated dice selection
// Player clicks "Roll!" to execute
```

### Core API Integration

```javascript
// Roll dice
async function rollDice(expression, token) {
    const response = await fetch('http://localhost:5000/api/dice/roll', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            expression: '3d6+2',
            description: 'Attack roll'
        })
    });

    const result = await response.json();
    console.log(`Rolled ${result.total}: ${result.breakdown}`);
}

// Send chat message with dice result
async function sendDiceResult(roomId, result) {
    const response = await fetch(`http://localhost:5000/api/chat/rooms/${roomId}/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            content: `🎯 **Rolled ${result.total}** (${result.expression})\n**Breakdown**: ${result.breakdown}`,
            username: 'PlayerName',
            user_role: 'player'
        })
    });
}

// Get statistics
async function getStats(token) {
    const response = await fetch('http://localhost:5000/api/dice/statistics', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    const data = await response.json();
    console.log(`Total rolls: ${data.stats.total_rolls}`);
}
```

### Python

```python
import requests

# Roll dice
def roll_dice(expression, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'

    response = requests.post(
        'http://localhost:5000/api/dice/roll',
        headers=headers,
        json={
            'expression': expression,
            'description': 'Python roll'
        }
    )

    result = response.json()
    print(f"Rolled {result['total']}: {result['breakdown']}")
    return result

# Parse expression
def validate_expression(expression):
    response = requests.post(
        'http://localhost:5000/api/dice/parse',
        json={'expression': expression}
    )

    result = response.json()
    return result['is_valid']
```

### cURL Examples

#### Core Dice API

```bash
# Roll dice (anonymous)
curl -X POST http://localhost:5000/api/dice/roll \
  -H "Content-Type: application/json" \
  -d '{"expression": "3d6+2"}'

# Roll with authentication
curl -X POST http://localhost:5000/api/dice/roll \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"expression": "d20", "advantage": true}'

# Get history
curl http://localhost:5000/api/dice/history?limit=10

# Parse expression
curl -X POST http://localhost:5000/api/dice/parse \
  -H "Content-Type: application/json" \
  -d '{"expression": "4d6kh3+2"}'
```

#### Chat API

```bash
# Join a chat room
curl -X POST http://localhost:5000/api/chat/rooms/demo-room/join \
  -H "Content-Type: application/json" \
  -d '{"username": "GameMaster", "user_role": "dm"}'

# Send chat message
curl -X POST http://localhost:5000/api/chat/rooms/demo-room/messages \
  -H "Content-Type: application/json" \
  -d '{"content": "Roll for initiative!", "username": "GameMaster", "user_role": "dm"}'

# Send dice request message
curl -X POST http://localhost:5000/api/chat/rooms/demo-room/messages \
  -H "Content-Type: application/json" \
  -d '{"content": "🎲 **DM requests dice roll**: 2d6+3\n**Description**: Roll 2d6+3 for skill check\n\n*Click this message to automatically set up the dice and roll!*", "username": "GameMaster", "user_role": "dm"}'

# Get room messages
curl http://localhost:5000/api/chat/rooms/demo-room/messages?limit=20
```

## Security Considerations

1. **Input Validation**: All dice expressions are validated before evaluation
2. **Rate Limiting**: Prevents abuse and DoS attacks
3. **SQL Injection**: Protected via SQLAlchemy ORM
4. **XSS Protection**: JSON responses with proper content-type headers
5. **Authentication**: JWT tokens with expiration
6. **Database Isolation**: Separate database for dice rolls
7. **Expression Limits**: Maximum expression length of 500 characters

## Performance

- **Response Time**: Average <50ms for simple rolls
- **Concurrent Users**: Supports 100+ concurrent users
- **Database**: SQLite for simplicity, can migrate to PostgreSQL for scale
- **Caching**: 15-minute cache for repeated expressions (optional)

## Deployment

### Docker

```dockerfile
FROM python:3.9-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 5001
CMD ["python", "dice_server.py"]
```

### Docker Compose

```yaml
version: '3.8'
services:
  dice-api:
    build: .
    ports:
      - "5001:5001"
    environment:
      - JWT_SECRET=your-secret-key
      - FLASK_ENV=production
    volumes:
      - ./auth.db:/app/auth.db
      - ./dice_rolls.db:/app/dice_rolls.db
```

## Monitoring

Recommended monitoring endpoints:

- `/api/dice/health` - Service health
- `/health` - Server health with database checks
- `/api/docs` - Built-in documentation

## Troubleshooting

### Common Issues

1. **Invalid expression error**
   - Verify dice notation syntax
   - Use `/api/dice/parse` to validate

2. **Authentication failed**
   - Check JWT token expiration
   - Verify token format (Bearer prefix)

3. **Rate limit exceeded**
   - Implement exponential backoff
   - Consider caching results

4. **Database locked (SQLite)**
   - Reduce concurrent writes
   - Consider PostgreSQL for production

## UI Components

### Simple Dice Chat Interface

The system includes a complete frontend component for dice rolling and chat:

**Files:**
- `dice/frontend/simple-dice-chat.js` - Main interface class
- `dice/frontend/simple-dice-chat.css` - Styling
- `dice/frontend/simple-demo.html` - Demo implementation

**Key Features:**
- **Visual Dice Selection**: Click-based dice selection with +/- buttons
- **Expression Preview**: Live preview of dice expression (e.g., "2d6+1d20+3")
- **Clickable Requests**: DM dice requests are clickable and auto-populate player modal
- **Real-time Updates**: 3-second polling with smart change detection
- **Modal Protection**: Prevents multiple modals and interface conflicts
- **Role-based UI**: Different interfaces for DM vs Player

### CSS Classes

```css
.simple-dice-chat           /* Main container */
.dice-selection             /* Dice selection grid */
.clickable-request          /* Clickable dice request messages */
.dice-request               /* DM dice request styling */
.dice-result                /* Player dice result styling */
.badge.request              /* "Dice Request" badge */
.badge.result               /* "Dice Result" badge */
```

## Database Schema Extensions

### SimpleChatMessage Table

| Column | Type | Description |
|--------|------|-------------|
| id | Integer | Primary key |
| room_id | String | Chat room identifier |
| content | Text | Message content |
| user_id | Integer | User ID (nullable) |
| username | String | Display name |
| user_role | String | dm/player/system |
| timestamp | DateTime | Message timestamp |
| is_system_message | Boolean | System message flag |
| extra_data | JSON | Additional metadata |

## Future Enhancements

- **WebSocket Integration**: Real-time updates instead of polling
- **Dice Animations**: Visual dice rolling animations
- **Campaign Integration**: Link with hex-crawl campaigns
- **Advanced Requests**: Dice pools, target numbers, success counting
- **Voice Commands**: "Hey DM, roll 2d6+3"
- **Mobile Responsive**: Touch-optimized dice selection
- **Theme Support**: Dark/light mode themes
- **Sound Effects**: Audio feedback for rolls
- **Roll History Export**: Save session transcripts
- **Dice Macros**: Saved complex expressions
- **Virtual Tabletop Integration**: API hooks for VTT platforms