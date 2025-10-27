import { __awaiter } from "tslib";
export class DiceAPIClient {
    constructor(baseUrl) {
        this.roomId = 'obsidian-room';
        this.username = '';
        this.userRole = 'player';
        this.authToken = '';
        this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    }
    setUserInfo(username, role = 'player') {
        this.username = username;
        this.userRole = role;
    }
    setRoomId(roomId) {
        this.roomId = roomId || 'obsidian-room';
    }
    getRoomId() {
        return this.roomId;
    }
    setAuthToken(token) {
        this.authToken = token;
    }
    getAuthToken() {
        return this.authToken;
    }
    isAuthenticated() {
        return !!this.authToken;
    }
    getAuthHeaders() {
        const headers = {
            'Content-Type': 'application/json',
        };
        if (this.authToken) {
            headers['Authorization'] = `Bearer ${this.authToken}`;
        }
        return headers;
    }
    joinRoom() {
        return __awaiter(this, void 0, void 0, function* () {
            // Debug: Log current auth state
            console.log('=== JOIN ROOM DEBUG ===');
            console.log('Current token:', this.authToken ? `${this.authToken.substring(0, 50)}...` : 'NO TOKEN');
            console.log('Headers being sent:', this.getAuthHeaders());
            console.log('API endpoint:', this.baseUrl);
            // For DMs, create the room first
            if (this.userRole === 'dm') {
                try {
                    console.log('Attempting to create room:', this.roomId);
                    const createResponse = yield fetch(`${this.baseUrl}/api/chat/rooms`, {
                        method: 'POST',
                        headers: this.getAuthHeaders(),
                        body: JSON.stringify({
                            room_id: this.roomId
                        })
                    });
                    // Room creation successful or already exists
                    if (createResponse.ok || createResponse.status === 409) {
                        // Continue to join room
                    }
                    else {
                        const errorText = yield createResponse.text();
                        throw new Error(`Failed to create room: ${errorText}`);
                    }
                }
                catch (error) {
                    // If room creation fails, try to join anyway (room might exist)
                    console.warn('Room creation failed, attempting to join existing room:', error.message);
                    // Check if it's still an auth issue
                    if (error.message.includes('Invalid authorization token')) {
                        throw new Error('FORCE_LOGOUT:Authentication token is invalid. Please logout and login again.');
                    }
                }
            }
            const response = yield fetch(`${this.baseUrl}/api/chat/rooms/${this.roomId}/join`, {
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
                    const errorBody = yield response.text();
                    errorDetails = errorBody;
                }
                catch (e) {
                    // Could not read error response body
                }
                throw new Error(`Failed to join room: ${response.statusText} - ${errorDetails}`);
            }
        });
    }
    sendMessage(content) {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield fetch(`${this.baseUrl}/api/chat/rooms/${this.roomId}/messages`, {
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
            return yield response.json();
        });
    }
    getMessages(limit = 50, offset = 0) {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield fetch(`${this.baseUrl}/api/chat/rooms/${this.roomId}/messages?limit=${limit}&offset=${offset}`, {
                method: 'GET',
                headers: this.getAuthHeaders()
            });
            if (!response.ok) {
                throw new Error(`Failed to get messages: ${response.statusText}`);
            }
            return yield response.json();
        });
    }
    rollDice(request) {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield fetch(`${this.baseUrl}/api/dice/roll`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(request)
            });
            if (!response.ok) {
                throw new Error(`Failed to roll dice: ${response.statusText}`);
            }
            return yield response.json();
        });
    }
    sendDiceRequest(expression, description) {
        return __awaiter(this, void 0, void 0, function* () {
            const content = `🎲 **${this.username} requests dice roll**: ${expression}\n**Description**: ${description}\n\n*Click this message to automatically set up the dice and roll!*`;
            return yield this.sendMessage(content);
        });
    }
    sendDiceResult(result) {
        return __awaiter(this, void 0, void 0, function* () {
            const content = `🎯 **Rolled ${result.total}** (${result.expression})\n**Breakdown**: ${result.breakdown}`;
            return yield this.sendMessage(content);
        });
    }
    parseDiceRequest(message) {
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
    checkHealth() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                console.log('Health check with headers:', this.getAuthHeaders());
                const response = yield fetch(`${this.baseUrl}/api/dice/health`, {
                    method: 'GET',
                    headers: this.getAuthHeaders()
                });
                console.log('Health check response:', response.status, response.statusText);
                if (response.ok) {
                    const data = yield response.json();
                    return data.status === 'healthy';
                }
                return false;
            }
            catch (error) {
                console.error('Health check failed:', error);
                return false;
            }
        });
    }
    login(username, password) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('=== LOGIN DEBUG ===');
            console.log('Login endpoint:', `${this.baseUrl}/api/auth/login`);
            console.log('Username:', username);
            const response = yield fetch(`${this.baseUrl}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password })
            });
            console.log('Login response status:', response.status);
            if (!response.ok) {
                const error = yield response.json();
                console.error('Login failed with error:', error);
                throw new Error(error.error || 'Login failed');
            }
            const result = yield response.json();
            console.log('Login successful, token received:', result.token ? `${result.token.substring(0, 50)}...` : 'NO TOKEN');
            console.log('User info:', result.user);
            this.setAuthToken(result.token);
            return result;
        });
    }
    register(username, password) {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield fetch(`${this.baseUrl}/api/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password })
            });
            if (!response.ok) {
                const error = yield response.json();
                throw new Error(error.error || 'Registration failed');
            }
            const result = yield response.json();
            this.setAuthToken(result.token);
            return result;
        });
    }
    logout() {
        this.authToken = '';
        // Clear from storage if implemented
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('dice_chat_token');
        }
    }
    // Auto-generate room ID for DMs
    generateRoomId() {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 8; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return result;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBpLWNsaWVudC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImFwaS1jbGllbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQXNDQSxNQUFNLE9BQU8sYUFBYTtJQU90QixZQUFZLE9BQWU7UUFMbkIsV0FBTSxHQUFXLGVBQWUsQ0FBQztRQUNqQyxhQUFRLEdBQVcsRUFBRSxDQUFDO1FBQ3RCLGFBQVEsR0FBb0IsUUFBUSxDQUFDO1FBQ3JDLGNBQVMsR0FBVyxFQUFFLENBQUM7UUFHM0IsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLHdCQUF3QjtJQUN2RSxDQUFDO0lBRUQsV0FBVyxDQUFDLFFBQWdCLEVBQUUsT0FBd0IsUUFBUTtRQUMxRCxJQUFJLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQztRQUN6QixJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQztJQUN6QixDQUFDO0lBRUQsU0FBUyxDQUFDLE1BQWM7UUFDcEIsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLElBQUksZUFBZSxDQUFDO0lBQzVDLENBQUM7SUFFRCxTQUFTO1FBQ0wsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDO0lBQ3ZCLENBQUM7SUFFRCxZQUFZLENBQUMsS0FBYTtRQUN0QixJQUFJLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQztJQUMzQixDQUFDO0lBRUQsWUFBWTtRQUNSLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQztJQUMxQixDQUFDO0lBRUQsZUFBZTtRQUNYLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUM7SUFDNUIsQ0FBQztJQUVPLGNBQWM7UUFDbEIsTUFBTSxPQUFPLEdBQWdCO1lBQ3pCLGNBQWMsRUFBRSxrQkFBa0I7U0FDckMsQ0FBQztRQUVGLElBQUksSUFBSSxDQUFDLFNBQVMsRUFBRTtZQUNoQixPQUFPLENBQUMsZUFBZSxDQUFDLEdBQUcsVUFBVSxJ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bnRlbnQiOlsiZXhwb3J0IGludGVyZmFjZSBEaWNlUm9sbFJlcXVlc3Qge1xyXG4gICAgZXhwcmVzc2lvbjogc3RyaW5nO1xyXG4gICAgZGVzY3JpcHRpb24/OiBzdHJpbmc7XHJcbiAgICBhZHZhbnRhZ2U/OiBib29sZWFuO1xyXG4gICAgZGlzYWR2YW50YWdlPzogYm9vbGVhbjtcclxuICAgIGNhbXBhaWduX2lkPzogc3RyaW5nO1xyXG4gICAgc2Vzc2lvbl9pZD86IHN0cmluZztcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBEaWNlUm9sbFJlc3VsdCB7XHJcbiAgICBpZDogbnVtYmVyO1xyXG4gICAgZXhwcmVzc2lvbjogc3RyaW5nO1xyXG4gICAgcmF3X3JvbGxzOiB7IFtrZXk6IHN0cmluZ106IG51bWJlcltdIH07XHJcbiAgICBtb2RpZmllcnM6IEFycmF5PFtzdHJpbmcsIG51bWJlcl0+O1xyXG4gICAgdG90YWw6IG51bWJlcjtcclxuICAgIGlzX2NyaXRpY2FsOiBib29sZWFuO1xyXG4gICAgaXNfZnVtYmxlOiBib29sZWFuO1xyXG4gICAgYnJlYWtkb3duOiBzdHJpbmc7XHJcbiAgICB0aW1lc3RhbXA/OiBzdHJpbmc7XHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgQ2hhdE1lc3NhZ2Uge1xyXG4gICAgaWQ/OiBudW1iZXI7XHJcbiAgICByb29tX2lkPzogc3RyaW5nO1xyXG4gICAgY29udGVudDogc3RyaW5nO1xyXG4gICAgdXNlcm5hbWU6IHN0cmluZztcclxuICAgIHVzZXJfcm9sZTogJ2RtJyB8ICdwbGF5ZXInIHwgJ3N5c3RlbSc7XHJcbiAgICB0aW1lc3RhbXA/OiBzdHJpbmc7XHJcbiAgICBpc19zeXN0ZW1fbWVzc2FnZT86IGJvb2xlYW47XHJcbiAgICBleHRyYV9kYXRhPzogYW55O1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIERpY2VSZXF1ZXN0IHtcclxuICAgIGV4cHJlc3Npb246IHN0cmluZztcclxuICAgIGRlc2NyaXB0aW9uOiBzdHJpbmc7XHJcbiAgICByZXF1ZXN0ZXI6IHN0cmluZztcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIERpY2VBUElDbGllbnQge1xyXG4gICAgcHJpdmF0ZSBiYXNlVXJsOiBzdHJpbmc7XHJcbiAgICBwcml2YXRlIHJvb21JZDogc3RyaW5nID0gJ29ic2lkaWFuLXJvb20nO1xyXG4gICAgcHJpdmF0ZSB1c2VybmFtZTogc3RyaW5nID0gJyc7XHJcbiAgICBwcml2YXRlIHVzZXJSb2xlOiAnZG0nIHwgJ3BsYXllcicgPSAncGxheWVyJztcclxuICAgIHByaXZhdGUgYXV0aFRva2VuOiBzdHJpbmcgPSAnJztcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihiYXNlVXJsOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLmJhc2VVcmwgPSBiYXNlVXJsLnJlcGxhY2UoL1xcLyQvLCAnJyk7IC8vIFJlbW92ZSB0cmFpbGluZyBzbGFzaFxyXG4gICAgfVxyXG5cclxuICAgIHNldFVzZXJJbmZvKHVzZXJuYW1lOiBzdHJpbmcsIHJvbGU6ICdkbScgfCAncGxheWVyJyA9ICdwbGF5ZXInKSB7XHJcbiAgICAgICAgdGhpcy51c2VybmFtZSA9IHVzZXJuYW1lO1xyXG4gICAgICAgIHRoaXMudXNlclJvbGUgPSByb2xlO1xyXG4gICAgfVxyXG5cclxuICAgIHNldFJvb21JZChyb29tSWQ6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMucm9vbUlkID0gcm9vbUlkIHx8ICdvYnNpZGlhbi1yb29tJztcclxuICAgIH1cclxuXHJcbiAgICBnZXRSb29tSWQoKTogc3RyaW5nIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5yb29tSWQ7XHJcbiAgICB9XHJcblxyXG4gICAgc2V0QXV0aFRva2VuKHRva2VuOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLmF1dGhUb2tlbiA9IHRva2VuO1xyXG4gICAgfVxyXG5cclxuICAgIGdldEF1dGhUb2tlbigpOiBzdHJpbmcge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmF1dGhUb2tlbjtcclxuICAgIH1cclxuXHJcbiAgICBpc0F1dGhlbnRpY2F0ZWQoKTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuICEhdGhpcy5hdXRoVG9rZW47XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnZXRBdXRoSGVhZGVycygpOiBIZWFkZXJzSW5pdCB7XHJcbiAgICAgICAgY29uc3QgaGVhZGVyczogSGVhZGVyc0luaXQgPSB7XHJcbiAgICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuYXV0aFRva2VuKSB7XHJcbiAgICAgICAgICAgIGhlYWRlcnNbJ0F1dGhvcml6YXRpb24nXSA9IGBCZWFyZXIgJHt0aGlzLmF1dGhUb2tlbn1gO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIGhlYWRlcnM7XHJcbiAgICB9XHJcblxyXG4gICAgYXN5bmMgam9pblJvb20oKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgLy8gRGVidWc6IExvZyBjdXJyZW50IGF1dGggc3RhdGVcclxuICAgICAgICBjb25zb2xlLmxvZygnPT09IEpPSU4gUk9PTSBERUJVRyA9PT0nKTtcclxuICAgICAgICBjb25zb2xlLmxvZygnQ3VycmVudCB0b2tlbjonLCB0aGlzLmF1dGhUb2tlbiA/IGAke3RoaXMuYXV0aFRva2VuLnN1YnN0cmluZygwLCA1MCl9Li4uYCA6ICdOTyBUT0tFTicpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdIZWFkZXJzIGJlaW5nIHNlbnQ6JywgdGhpcy5nZXRBdXRoSGVhZGVycygpKTtcclxuICAgICAgICBjb25zb2xlLmxvZygnQVBJIGVuZHBvaW50OicsIHRoaXMuYmFzZVVybCk7XHJcblxyXG4gICAgICAgIC8vIEZvciBETXMsIGNyZWF0ZSB0aGUgcm9vbSBmaXJzdFxyXG4gICAgICAgIGlmICh0aGlzLnVzZXJSb2xlID09PSAnZG0nKSB7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnQXR0ZW1wdGluZyB0byBjcmVhdGUgcm9vbTonLCB0aGlzLnJvb21JZCk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBjcmVhdGVSZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke3RoaXMuYmFzZVVybH0vYXBpL2NoYXQvcm9vbXNgLCB7XHJcbiAgICAgICAgICAgICAgICAgICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICAgICAgICAgICAgICAgICAgaGVhZGVyczogdGhpcy5nZXRBdXRoSGVhZGVycygpLFxyXG4gICAgICAgICAgICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcm9vbV9pZDogdGhpcy5yb29tSWRcclxuICAgICAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gUm9vbSBjcmVhdGlvbiBzdWNjZXNzZnVsIG9yIGFscmVhZHkgZXhpc3RzXHJcbiAgICAgICAgICAgICAgICBpZiAoY3JlYXRlUmVzcG9uc2Uub2sgfHwgY3JlYXRlUmVzcG9uc2Uuc3RhdHVzID09PSA0MDkpIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBDb250aW51ZSB0byBqb2luIHJvb21cclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZXJyb3JUZXh0ID0gYXdhaXQgY3JlYXRlUmVzcG9uc2UudGV4dCgpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIGNyZWF0ZSByb29tOiAke2Vycm9yVGV4dH1gKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgIC8vIElmIHJvb20gY3JlYXRpb24gZmFpbHMsIHRyeSB0byBqb2luIGFueXdheSAocm9vbSBtaWdodCBleGlzdClcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybignUm9vbSBjcmVhdGlvbiBmYWlsZWQsIGF0dGVtcHRpbmcgdG8gam9pbiBleGlzdGluZyByb29tOicsIGVycm9yLm1lc3NhZ2UpO1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIGl0J3Mgc3RpbGwgYW4gYXV0aCBpc3N1ZVxyXG4gICAgICAgICAgICAgICAgaWYgKGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ0ludmFsaWQgYXV0aG9yaXphdGlvbiB0b2tlbicpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdGT1JDRV9MT0dPVVQ6QXV0aGVudGljYXRpb24gdG9rZW4gaXMgaW52YWxpZC4gUGxlYXNlIGxvZ291dCBhbmQgbG9naW4gYWdhaW4uJyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYCR7dGhpcy5iYXNlVXJsfS9hcGkvY2hhdC9yb29tcy8ke3RoaXMucm9vbUlkfS9qb2luYCwge1xyXG4gICAgICAgICAgICBtZXRob2Q6ICdQT1NUJyxcclxuICAgICAgICAgICAgaGVhZGVyczogdGhpcy5nZXRBdXRoSGVhZGVycygpLFxyXG4gICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgICAgICAgICAgICB1c2VybmFtZTogdGhpcy51c2VybmFtZSxcclxuICAgICAgICAgICAgICAgIHVzZXJfcm9sZTogdGhpcy51c2VyUm9sZVxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XHJcbiAgICAgICAgICAgIGxldCBlcnJvckRldGFpbHMgPSAnVW5rbm93biBlcnJvcic7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBlcnJvckJvZHkgPSBhd2FpdCByZXNwb25zZS50ZXh0KCk7XHJcbiAgICAgICAgICAgICAgICBlcnJvckRldGFpbHMgPSBlcnJvckJvZHk7XHJcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgICAgICAgICAgIC8vIENvdWxkIG5vdCByZWFkIGVycm9yIHJlc3BvbnNlIGJvZHlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBqb2luIHJvb206ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH0gLSAke2Vycm9yRGV0YWlsc31gKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgYXN5bmMgc2VuZE1lc3NhZ2UoY29udGVudDogc3RyaW5nKTogUHJvbWlzZTxDaGF0TWVzc2FnZT4ge1xyXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYCR7dGhpcy5iYXNlVXJsfS9hcGkvY2hhdC9yb29tcy8ke3RoaXMucm9vbUlkfS9tZXNzYWdlc2AsIHtcclxuICAgICAgICAgICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICAgICAgICAgIGhlYWRlcnM6IHRoaXMuZ2V0QXV0aEhlYWRlcnMoKSxcclxuICAgICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgICAgICAgICAgY29udGVudCxcclxuICAgICAgICAgICAgICAgIHVzZXJuYW1lOiB0aGlzLnVzZXJuYW1lLFxyXG4gICAgICAgICAgICAgICAgdXNlcl9yb2xlOiB0aGlzLnVzZXJSb2xlXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gc2VuZCBtZXNzYWdlOiAke3Jlc3BvbnNlLnN0YXR1c1RleHR9YCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIGdldE1lc3NhZ2VzKGxpbWl0OiBudW1iZXIgPSA1MCwgb2Zmc2V0OiBudW1iZXIgPSAwKTogUHJvbWlzZTx7IG1lc3NhZ2VzOiBDaGF0TWVzc2FnZVtdLCBjb3VudDogbnVtYmVyIH0+IHtcclxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke3RoaXMuYmFzZVVybH0vYXBpL2NoYXQvcm9vbXMvJHt0aGlzLnJvb21JZH0vbWVzc2FnZXM/bGltaXQ9JHtsaW1pdH0mb2Zmc2V0PSR7b2Zmc2V0fWAsIHtcclxuICAgICAgICAgICAgbWV0aG9kOiAnR0VUJyxcclxuICAgICAgICAgICAgaGVhZGVyczogdGhpcy5nZXRBdXRoSGVhZGVycygpXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gZ2V0IG1lc3NhZ2VzOiAke3Jlc3BvbnNlLnN0YXR1c1RleHR9YCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIHJvbGxEaWNlKHJlcXVlc3Q6IERpY2VSb2xsUmVxdWVzdCk6IFByb21pc2U8RGljZVJvbGxSZXN1bHQ+IHtcclxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke3RoaXMuYmFzZVVybH0vYXBpL2RpY2Uvcm9sbGAsIHtcclxuICAgICAgICAgICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICAgICAgICAgIGhlYWRlcnM6IHRoaXMuZ2V0QXV0aEhlYWRlcnMoKSxcclxuICAgICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkocmVxdWVzdClcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byByb2xsIGRpY2U6ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH1gKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcbiAgICB9XHJcblxyXG4gICAgYXN5bmMgc2VuZERpY2VSZXF1ZXN0KGV4cHJlc3Npb246IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZyk6IFByb21pc2U8Q2hhdE1lc3NhZ2U+IHtcclxuICAgICAgICBjb25zdCBjb250ZW50ID0gYPCfjrIgKioke3RoaXMudXNlcm5hbWV9IHJlcXVlc3RzIGRpY2Ugcm9sbCoqOiAke2V4cHJlc3Npb259XFxuKipEZXNjcmlwdGlvbioqOiAke2Rlc2NyaXB0aW9ufVxcblxcbipDbGljayB0aGlzIG1lc3NhZ2UgdG8gYXV0b21hdGljYWxseSBzZXQgdXAgdGhlIGRpY2UgYW5kIHJvbGwhKmA7XHJcblxyXG4gICAgICAgIHJldHVybiBhd2FpdCB0aGlzLnNlbmRNZXNzYWdlKGNvbnRlbnQpO1xyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIHNlbmREaWNlUmVzdWx0KHJlc3VsdDogRGljZVJvbGxSZXN1bHQpOiBQcm9taXNlPENoYXRNZXNzYWdlPiB7XHJcbiAgICAgICAgY29uc3QgY29udGVudCA9IGDwn46vICoqUm9sbGVkICR7cmVzdWx0LnRvdGFsfSoqICgke3Jlc3VsdC5leHByZXNzaW9ufSlcXG4qKkJyZWFrZG93bioqOiAke3Jlc3VsdC5icmVha2Rvd259YDtcclxuXHJcbiAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuc2VuZE1lc3NhZ2UoY29udGVudCk7XHJcbiAgICB9XHJcblxyXG4gICAgcGFyc2VEaWNlUmVxdWVzdChtZXNzYWdlOiBzdHJpbmcpOiBEaWNlUmVxdWVzdCB8IG51bGwge1xyXG4gICAgICAgIGNvbnN0IHJlcXVlc3RNYXRjaCA9IG1lc3NhZ2UubWF0Y2goL/CfjrIgXFwqXFwqKC4rPykgcmVxdWVzdHMgZGljZSByb2xsXFwqXFwqOiAoLis/KVxcblxcKlxcKkRlc2NyaXB0aW9uXFwqXFwqOiAoLis/KVxcbi8pO1xyXG4gICAgICAgIGlmIChyZXF1ZXN0TWF0Y2gpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgICAgIGV4cHJlc3Npb246IHJlcXVlc3RNYXRjaFsyXSxcclxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiByZXF1ZXN0TWF0Y2hbM10sXHJcbiAgICAgICAgICAgICAgICByZXF1ZXN0ZXI6IHJlcXVlc3RNYXRjaFsxXVxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBhc3luYyBjaGVja0hlYWx0aCgpOiBQcm9taXNlPGJvb2xlYW4+IHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnSGVhbHRoIGNoZWNrIHdpdGggaGVhZGVyczonLCB0aGlzLmdldEF1dGhIZWFkZXJzKCkpO1xyXG4gICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke3RoaXMuYmFzZVVybH0vYXBpL2RpY2UvaGVhbHRoYCwge1xyXG4gICAgICAgICAgICAgICAgbWV0aG9kOiAnR0VUJyxcclxuICAgICAgICAgICAgICAgIGhlYWRlcnM6IHRoaXMuZ2V0QXV0aEhlYWRlcnMoKVxyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdIZWFsdGggY2hlY2sgcmVzcG9uc2U6JywgcmVzcG9uc2Uuc3RhdHVzLCByZXNwb25zZS5zdGF0dXNUZXh0KTtcclxuICAgICAgICAgICAgaWYgKHJlc3BvbnNlLm9rKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBkYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGRhdGEuc3RhdHVzID09PSAnaGVhbHRoeSc7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0hlYWx0aCBjaGVjayBmYWlsZWQ6JywgZXJyb3IpO1xyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIGxvZ2luKHVzZXJuYW1lOiBzdHJpbmcsIHBhc3N3b3JkOiBzdHJpbmcpOiBQcm9taXNlPHsgdG9rZW46IHN0cmluZywgdXNlcjogYW55IH0+IHtcclxuICAgICAgICBjb25zb2xlLmxvZygnPT09IExPR0lOIERFQlVHID09PScpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdMb2dpbiBlbmRwb2ludDonLCBgJHt0aGlzLmJhc2VVcmx9L2FwaS9hdXRoL2xvZ2luYCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1VzZXJuYW1lOicsIHVzZXJuYW1lKTtcclxuXHJcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChgJHt0aGlzLmJhc2VVcmx9L2FwaS9hdXRoL2xvZ2luYCwge1xyXG4gICAgICAgICAgICBtZXRob2Q6ICdQT1NUJyxcclxuICAgICAgICAgICAgaGVhZGVyczoge1xyXG4gICAgICAgICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyB1c2VybmFtZSwgcGFzc3dvcmQgfSlcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY29uc29sZS5sb2coJ0xvZ2luIHJlc3BvbnNlIHN0YXR1czonLCByZXNwb25zZS5zdGF0dXMpO1xyXG5cclxuICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGVycm9yID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdMb2dpbiBmYWlsZWQgd2l0aCBlcnJvcjonLCBlcnJvcik7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihlcnJvci5lcnJvciB8fCAnTG9naW4gZmFpbGVkJyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ0xvZ2luIHN1Y2Nlc3NmdWwsIHRva2VuIHJlY2VpdmVkOicsIHJlc3VsdC50b2tlbiA/IGAke3Jlc3VsdC50b2tlbi5zdWJzdHJpbmcoMCwgNTApfS4uLmAgOiAnTk8gVE9LRU4nKTtcclxuICAgICAgICBjb25zb2xlLmxvZygnVXNlciBpbmZvOicsIHJlc3VsdC51c2VyKTtcclxuXHJcbiAgICAgICAgdGhpcy5zZXRBdXRoVG9rZW4ocmVzdWx0LnRva2VuKTtcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIHJlZ2lzdGVyKHVzZXJuYW1lOiBzdHJpbmcsIHBhc3N3b3JkOiBzdHJpbmcpOiBQcm9taXNlPHsgdG9rZW46IHN0cmluZywgdXNlcjogYW55IH0+IHtcclxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke3RoaXMuYmFzZVVybH0vYXBpL2F1dGgvcmVnaXN0ZXJgLCB7XHJcbiAgICAgICAgICAgIG1ldGhvZDogJ1BPU1QnLFxyXG4gICAgICAgICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHVzZXJuYW1lLCBwYXNzd29yZCB9KVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGVycm9yID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoZXJyb3IuZXJyb3IgfHwgJ1JlZ2lzdHJhdGlvbiBmYWlsZWQnKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICAgICAgICB0aGlzLnNldEF1dGhUb2tlbihyZXN1bHQudG9rZW4pO1xyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgbG9nb3V0KCkge1xyXG4gICAgICAgIHRoaXMuYXV0aFRva2VuID0gJyc7XHJcbiAgICAgICAgLy8gQ2xlYXIgZnJvbSBzdG9yYWdlIGlmIGltcGxlbWVudGVkXHJcbiAgICAgICAgaWYgKHR5cGVvZiBsb2NhbFN0b3JhZ2UgIT09ICd1bmRlZmluZWQnKSB7XHJcbiAgICAgICAgICAgIGxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKCdkaWNlX2NoYXRfdG9rZW4nKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQXV0by1nZW5lcmF0ZSByb29tIElEIGZvciBETXNcclxuICAgIGdlbmVyYXRlUm9vbUlkKCk6IHN0cmluZyB7XHJcbiAgICAgICAgY29uc3QgY2hhcmFjdGVycyA9ICdBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWjAxMjM0NTY3ODknO1xyXG4gICAgICAgIGxldCByZXN1bHQgPSAnJztcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDg7IGkrKykge1xyXG4gICAgICAgICAgICByZXN1bHQgKz0gY2hhcmFjdGVycy5jaGFyQXQoTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogY2hhcmFjdGVycy5sZW5ndGgpKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxufSJdfQ==