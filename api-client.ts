export interface DiceRollRequest {
    expression: string;
    description?: string;
    advantage?: boolean;
    disadvantage?: boolean;
    campaign_id?: string;
    session_id?: string;
}

export interface DiceRollResult {
    id: number;
    expression: string;
    raw_rolls: { [key: string]: number[] };
    modifiers: Array<[string, number]>;
    total: number;
    is_critical: boolean;
    is_fumble: boolean;
    breakdown: string;
    timestamp?: string;
}

export interface ChatMessage {
    id?: number;
    room_id?: string;
    content: string;
    username: string;
    user_role: 'dm' | 'player' | 'system';
    timestamp?: string;
    is_system_message?: boolean;
    extra_data?: any;
}

export interface DiceRequest {
    expression: string;
    description: string;
    requester: string;
}

export class DiceAPIClient {
    private baseUrl: string;
    private roomId: string = 'obsidian-room';
    private username: string = '';
    private userRole: 'dm' | 'player' = 'player';
    private authToken: string = '';

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    }

    setUserInfo(username: string, role: 'dm' | 'player' = 'player') {
        this.username = username;
        this.userRole = role;
    }

    setRoomId(roomId: string) {
        this.roomId = roomId || 'obsidian-room';
    }

    getRoomId(): string {
        return this.roomId;
    }

    setAuthToken(token: string) {
        this.authToken = token;
    }

    getAuthToken(): string {
        return this.authToken;
    }

    isAuthenticated(): boolean {
        return !!this.authToken;
    }

    private getAuthHeaders(): HeadersInit {
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
        };

        if (this.authToken) {
            headers['Authorization'] = `Bearer ${this.authToken}`;
        }

        return headers;
    }

    async joinRoom(): Promise<void> {
        // Debug: Log current auth state
        console.log('=== JOIN ROOM DEBUG ===');
        console.log('Current token:', this.authToken ? `${this.authToken.substring(0, 50)}...` : 'NO TOKEN');
        console.log('Headers being sent:', this.getAuthHeaders());
        console.log('API endpoint:', this.baseUrl);

        // For DMs, create the room first
        if (this.userRole === 'dm') {
            try {
                console.log('Attempting to create room:', this.roomId);
                const createResponse = await fetch(`${this.baseUrl}/api/chat/rooms`, {
                    method: 'POST',
                    headers: this.getAuthHeaders(),
                    body: JSON.stringify({
                        room_id: this.roomId
                    })
                });

                // Room creation successful or already exists
                if (createResponse.ok || createResponse.status === 409) {
                    // Continue to join room
                } else {
                    const errorText = await createResponse.text();
                    throw new Error(`Failed to create room: ${errorText}`);
                }
            } catch (error) {
                // If room creation fails, try to join anyway (room might exist)
                console.warn('Room creation failed, attempting to join existing room:', error.message);

                // Check if it's still an auth issue
                if (error.message.includes('Invalid authorization token')) {
                    throw new Error('FORCE_LOGOUT:Authentication token is invalid. Please logout and login again.');
                }
            }
        }

        const response = await fetch(`${this.baseUrl}/api/chat/rooms/${this.roomId}/join`, {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify({
                username: this.username,
                user_role: this.userRole
            })
        });

        if (!response.ok) {
            let errorDetails = 'Unknown error';
            try {
                const errorBody = await response.text();
                errorDetails = errorBody;
            } catch (e) {
                // Could not read error response body
            }
            throw new Error(`Failed to join room: ${response.statusText} - ${errorDetails}`);
        }
    }

    async sendMessage(content: string): Promise<ChatMessage> {
        const response = await fetch(`${this.baseUrl}/api/chat/rooms/${this.roomId}/messages`, {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify({
                content,
                username: this.username,
                user_role: this.userRole
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to send message: ${response.statusText}`);
        }

        return await response.json();
    }

    async getMessages(limit: number = 50, offset: number = 0): Promise<{ messages: ChatMessage[], count: number }> {
        const response = await fetch(`${this.baseUrl}/api/chat/rooms/${this.roomId}/messages?limit=${limit}&offset=${offset}`, {
            method: 'GET',
            headers: this.getAuthHeaders()
        });

        if (!response.ok) {
            throw new Error(`Failed to get messages: ${response.statusText}`);
        }

        return await response.json();
    }

    async rollDice(request: DiceRollRequest): Promise<DiceRollResult> {
        const response = await fetch(`${this.baseUrl}/api/dice/roll`, {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify(request)
        });

        if (!response.ok) {
            throw new Error(`Failed to roll dice: ${response.statusText}`);
        }

        return await response.json();
    }

    async sendDiceRequest(expression: string, description: string): Promise<ChatMessage> {
        const content = `🎲 **${this.username} requests dice roll**: ${expression}\n**Description**: ${description}\n\n*Click this message to automatically set up the dice and roll!*`;

        return await this.sendMessage(content);
    }

    async sendDiceResult(result: DiceRollResult): Promise<ChatMessage> {
        const content = `🎯 **Rolled ${result.total}** (${result.expression})\n**Breakdown**: ${result.breakdown}`;

        return await this.sendMessage(content);
    }

    parseDiceRequest(message: string): DiceRequest | null {
        const requestMatch = message.match(/🎲 \*\*(.+?) requests dice roll\*\*: (.+?)\n\*\*Description\*\*: (.+?)\n/);
        if (requestMatch) {
            return {
                expression: requestMatch[2],
                description: requestMatch[3],
                requester: requestMatch[1]
            };
        }
        return null;
    }

    async checkHealth(): Promise<boolean> {
        try {
            console.log('Health check with headers:', this.getAuthHeaders());
            const response = await fetch(`${this.baseUrl}/api/dice/health`, {
                method: 'GET',
                headers: this.getAuthHeaders()
            });

            console.log('Health check response:', response.status, response.statusText);
            if (response.ok) {
                const data = await response.json();
                return data.status === 'healthy';
            }
            return false;
        } catch (error) {
            console.error('Health check failed:', error);
            return false;
        }
    }

    async login(username: string, password: string): Promise<{ token: string, user: any }> {
        console.log('=== LOGIN DEBUG ===');
        console.log('Login endpoint:', `${this.baseUrl}/api/auth/login`);
        console.log('Username:', username);

        const response = await fetch(`${this.baseUrl}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password })
        });

        console.log('Login response status:', response.status);

        if (!response.ok) {
            const error = await response.json();
            console.error('Login failed with error:', error);
            throw new Error(error.error || 'Login failed');
        }

        const result = await response.json();
        console.log('Login successful, token received:', result.token ? `${result.token.substring(0, 50)}...` : 'NO TOKEN');
        console.log('User info:', result.user);

        this.setAuthToken(result.token);
        return result;
    }

    async register(username: string, password: string): Promise<{ token: string, user: any }> {
        const response = await fetch(`${this.baseUrl}/api/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Registration failed');
        }

        const result = await response.json();
        this.setAuthToken(result.token);
        return result;
    }

    logout() {
        this.authToken = '';
        // Clear from storage if implemented
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('dice_chat_token');
        }
    }

    // Auto-generate room ID for DMs
    generateRoomId(): string {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 8; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return result;
    }
}