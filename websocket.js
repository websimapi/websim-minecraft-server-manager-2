import { wsUrl, reconnectInterval, maxReconnectAttempts } from './config.js';
import * as state from './state.js';
import * as ui from './ui.js';

let socket = null;
let messageHandler = () => {};

export function sendWebSocketMessage(message) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
    } else {
        ui.showToast('Not connected to server', 'error');
    }
}

function attemptReconnect() {
    if (state.get().reconnectAttempts < maxReconnectAttempts) {
        state.incrementReconnectAttempts();
        console.log(`Attempting to reconnect... (${state.get().reconnectAttempts}/${maxReconnectAttempts})`);
        setTimeout(() => connectWebSocket(messageHandler), reconnectInterval);
    } else {
        ui.showToast('Failed to connect to server after multiple attempts.', 'error');
        console.error('Max reconnection attempts reached.');
    }
}

export function connectWebSocket(handler) {
    messageHandler = handler;
    try {
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
            console.log('WebSocket connected');
            state.setConnected(true);
            state.resetReconnectAttempts();
            ui.showToast('Connected to server bridge', 'success');
            ui.updateBridgeStatus(true);
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                messageHandler(data);
            } catch (e) {
                console.error("Failed to parse WebSocket message:", e);
            }
        };

        socket.onclose = () => {
            console.log('WebSocket disconnected');
            state.setConnected(false);
            ui.updateBridgeStatus(false);
            ui.updateServerStatus(false); // Visually indicate server is offline since connection is lost
            attemptReconnect();
        };

        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            ui.showToast('Connection error', 'error');
            // onclose will be called next, triggering reconnect logic
        };
    } catch (error) {
        console.error('Failed to create WebSocket:', error);
        attemptReconnect();
    }
}