import { connectWebSocket, sendWebSocketMessage } from './websocket.js';
import * as api from './api.js';
import * as ui from './ui.js';
import * as state from './state.js';
import { updateInterval } from './config.js';

function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'console':
            ui.appendConsoleOutput(data.message);
            break;
        case 'status':
            state.setServerStatus(data.online ? 'online' : 'offline');
            state.setServerStartTime(data.startTime);
            ui.updateServerStatus(data.online, data.stats, data.startTime);
            if (data.config) {
                ui.updateSettings(data.config);
            }
            ui.hideLoading();
            break;
        case 'settings':
            ui.updateSettings(data.config);
            break;
        case 'players':
            state.setPlayers(data.players);
            ui.updatePlayersList(data.players);
            break;
        case 'notification':
            ui.showToast(data.message, data.level || 'info');
            if (data.message.includes('Backup created')) {
                ui.hideLoading();
            }
            break;
        case 'error':
            ui.showToast(data.message, 'error');
            ui.hideLoading();
            break;
        default:
            console.log('Unknown message type:', data.type);
    }
}

function startPeriodicUpdates() {
    setInterval(() => {
        if (state.get().isConnected) {
            api.ping();
        }
    }, updateInterval);
}

function initialize() {
    ui.initialize(api);
    ui.updateBridgeStatus(false);
    ui.updateServerStatus(false);
    connectWebSocket(handleWebSocketMessage);
    startPeriodicUpdates();
}

document.addEventListener('DOMContentLoaded', initialize);

// Handle mobile responsiveness
window.addEventListener('resize', () => {
    if (window.innerWidth <= 768) {
        document.body.classList.add('mobile');
    } else {
        document.body.classList.remove('mobile');
    }
});