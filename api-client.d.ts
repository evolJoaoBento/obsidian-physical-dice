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
    raw_rolls: {
        [key: string]: number[];
    };
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
export declare class DiceAPIClient {
    private baseUrl;
    private roomId;
    private username;
    private userRole;
    private authToken;
    constructor(baseUrl: string);
    setUserInfo(username: string, role?: 'dm' | 'player'): void;
    setRoomId(roomId: string): void;
    getRoomId(): string;
    setAuthToken(token: string): void;
    getAuthToken(): string;
    isAuthenticated(): boolean;
    private getAuthHeaders;
    joinRoom(): Promise<void>;
    sendMessage(content: string): Promise<ChatMessage>;
    getMessages(limit?: number, offset?: number): Promise<{
        messages: ChatMessage[];
        count: number;
    }>;
    rollDice(request: DiceRollRequest): Promise<DiceRollResult>;
    sendDiceRequest(expression: string, description: string): Promise<ChatMessage>;
    sendDiceResult(result: DiceRollResult): Promise<ChatMessage>;
    parseDiceRequest(message: string): DiceRequest | null;
    checkHealth(): Promise<boolean>;
    login(username: string, password: string): Promise<{
        token: string;
        user: any;
    }>;
    register(username: string, password: string): Promise<{
        token: string;
        user: any;
    }>;
    logout(): void;
    generateRoomId(): string;
}
