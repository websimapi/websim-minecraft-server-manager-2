const WebSocket = require('ws');

function setupWebSocket(serverInstance) {
    const server = require('http').createServer(serverInstance.app);
    serverInstance.httpServer = server;
    serverInstance.wss = new WebSocket.Server({ server });

    serverInstance.wss.on('connection', (ws) => {
        console.log('Client connected');

        serverInstance.sendToClient(ws, {
            type: 'status',
            online: serverInstance.minecraft.serverStatus === 'online',
            stats: serverInstance.minecraft.stats,
            players: serverInstance.minecraft.players,
            startTime: serverInstance.minecraft.startTime,
            config: serverInstance.minecraft.config
        });

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                handleClientMessage(serverInstance, ws, data);
            } catch (error) {
                console.error('Invalid message:', error);
            }
        });

        ws.on('close', () => {
            console.log('Client disconnected');
        });
    });

    server.listen(serverInstance.config.port, () => {
        console.log(`Server running on http://localhost:${serverInstance.config.port}`);
    });
}

function handleClientMessage(serverInstance, ws, data) {
    switch (data.type) {
        case 'start':
            serverInstance.minecraft.start();
            break;
        case 'stop':
            serverInstance.minecraft.stop();
            break;
        case 'restart':
            serverInstance.minecraft.restart();
            break;
        case 'command':
            serverInstance.minecraft.sendCommand(data.command);
            break;
        case 'backup':
            serverInstance.minecraft.createBackup();
            break;
        case 'settings':
            serverInstance.minecraft.updateSettings(data.settings);
            break;
        case 'update':
            serverInstance.minecraft.applyUpdate(data.files);
            break;
        case 'kill-all':
            serverInstance.minecraft.killAllJava();
            break;
        case 'ping':
            serverInstance.sendToClient(ws, {
                type: 'status',
                online: serverInstance.minecraft.serverStatus === 'online',
                stats: serverInstance.minecraft.stats,
                players: serverInstance.minecraft.players,
                startTime: serverInstance.minecraft.startTime,
                config: serverInstance.minecraft.config
            });
            break;
        default:
            console.log('Unknown message type:', data.type);
    }
}

module.exports = { setupWebSocket };