const express = require('express');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { serverConfig } = require('./config.js');
const { setupExpress } = require('./http.js');
const { setupWebSocket } = require('./websocket.js');
const MinecraftAdapter = require('./minecraft-adapter.js');

class MinecraftServer {
    constructor() {
        this.app = express();
        this.config = serverConfig;
        this.httpServer = null;
        this.wss = null;
        
        this.minecraft = new MinecraftAdapter(this.broadcastMessage.bind(this));
        this.minecraft.setServerInstance(this);

        this.initialize();
    }

    initialize() {
        this.setupMinecraftDirectory();
        setupExpress(this);
        setupWebSocket(this);
        
        if (this.config.autoStart) {
            setTimeout(() => this.minecraft.start(), 2000);
        }

        // Handle clean shutdown to prevent zombie processes
        const cleanup = () => {
            console.log('Bridge shutting down...');
            if (this.minecraft) {
                this.minecraft.killChildProcess();
            }
            process.exit(0);
        };

        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
    }

    setupMinecraftDirectory() {
        if (!fs.existsSync(this.config.minecraftDir)) {
            fs.mkdirSync(this.config.minecraftDir, { recursive: true });
        }
        
        const serverPropsPath = path.join(this.config.minecraftDir, 'server.properties');
        if (!fs.existsSync(serverPropsPath)) {
            const defaultProps = `
server-port=${this.config.mcPort || 25565}
max-players=20
online-mode=true
white-list=false
enable-rcon=true
rcon.port=25575
rcon.password=minecraft
            `.trim();
            fs.writeFileSync(serverPropsPath, defaultProps);
        }
        
        const eulaPath = path.join(this.config.minecraftDir, 'eula.txt');
        if (!fs.existsSync(eulaPath)) {
            fs.writeFileSync(eulaPath, 'eula=true\n');
        }
    }
    
    sendToClient(ws, message) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }

    broadcastMessage(message) {
        if (!this.wss) return;
        this.wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(message));
            }
        });
    }
}

module.exports = MinecraftServer;