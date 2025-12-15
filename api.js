import { sendWebSocketMessage } from './websocket.js';
import * as ui from './ui.js';
import * as state from './state.js';
import { zipFilename } from './config.js';

export function toggleServer() {
    if (state.get().serverStatus === 'online') {
        stopServer();
    } else {
        startServer();
    }
}

export function startServer() {
    ui.showLoading();
    sendWebSocketMessage({ type: 'start' });
    ui.showToast('Starting server...', 'info');
}

export function stopServer() {
    ui.showLoading();
    sendWebSocketMessage({ type: 'stop' });
    ui.showToast('Stopping server...', 'info');
}

export function restartServer() {
    ui.showLoading();
    sendWebSocketMessage({ type: 'restart' });
    ui.showToast('Restarting server...', 'info');
}

export function saveWorld() {
    sendWebSocketMessage({ type: 'command', command: 'save-all' });
    ui.showToast('Saving world...', 'info');
}

export function createBackup() {
    ui.showLoading();
    sendWebSocketMessage({ type: 'backup' });
    ui.showToast('Creating backup...', 'info');
}

export function sendCommand() {
    const input = document.getElementById('commandInput');
    const command = input.value.trim();

    if (command) {
        sendWebSocketMessage({ type: 'command', command });
        ui.appendConsoleOutput(`> ${command}`, 'command');
        input.value = '';
    }
}

function playerAction(command) {
    const playerName = document.getElementById('playerActionInput').value.trim();
    if (playerName) {
        sendWebSocketMessage({
            type: 'command',
            command: `${command} ${playerName}`
        });
        const actionText = command.charAt(0).toUpperCase() + command.slice(1);
        ui.showToast(`${actionText} player: ${playerName}`, 'info');
        document.getElementById('playerActionInput').value = '';
    }
}

export function kickPlayer() {
    playerAction('kick');
}

export function banPlayer() {
    playerAction('ban');
}

export function opPlayer() {
    playerAction('op');
}

export function uploadFile(file) {
    if (!file) return;

    ui.showLoading();
    const formData = new FormData();
    formData.append('file', file);

    fetch('/api/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        ui.hideLoading();
        if (data.success) {
            ui.showToast('File uploaded successfully', 'success');
        } else {
            ui.showToast(data.message || 'Failed to upload file', 'error');
        }
    })
    .catch(error => {
        ui.hideLoading();
        ui.showToast('Upload error', 'error');
        console.error('Upload error:', error);
    });
}

export function saveSettings() {
    const settings = {
        serverType: document.getElementById('serverTypeSelect').value,
        minecraftVersion: document.getElementById('minecraftVersionInput').value.trim() || 'latest',
        maxPlayers: parseInt(document.getElementById('maxPlayersInput').value, 10),
        port: parseInt(document.getElementById('portInput').value, 10),
        ram: parseInt(document.getElementById('ramInput').value, 10),
        autoStart: document.getElementById('autoStartCheck').checked,
        enableGeyser: document.getElementById('enableGeyserCheck').checked,
        autoUpdateGeyser: document.getElementById('autoUpdateGeyserCheck').checked,
        enableFloodgate: document.getElementById('enableFloodgateCheck').checked,
        enableViaVersion: document.getElementById('enableViaVersionCheck').checked
    };

    sendWebSocketMessage({ type: 'settings', settings });
}

export function forceKillServer() {
    if (confirm('Are you sure? This will attempt to kill ALL Java processes on the host machine. Use this only if the server is stuck/broken.')) {
        sendWebSocketMessage({ type: 'kill-all' });
        ui.showToast('Sending kill signal...', 'warning');
    }
}

export function updateBridge() {
    if (!confirm('This will update the bridge software and restart it. The server will briefly go offline. Continue?')) return;

    ui.showLoading();
    ui.showToast('Fetching latest bridge code...', 'info');

    /* List of files to sync. Must match the structure in downloadBridge */
    const filesToFetch = [
        'server.js',
        'package.json',
        'server/config.js',
        'server/http.js',
        'server/minecraft-adapter.js',
        'server/minecraft-server.js',
        'server/websocket.js',
        'server/adapter/backup.js',
        'server/adapter/parser.js',
        'server/adapter/preparation.js',
        'server/adapter/downloader.js',
        'server/adapter/settings.js',
        'server/adapter/process-management.js',
        'server/adapter/updater.js'
    ];

    const fetchPromises = filesToFetch.map(file =>
        fetch(file)
        .then(res => {
            if (!res.ok) throw new Error(`Failed to fetch ${file}`);
            return res.text();
        })
        .then(content => ({ path: file, content }))
    );

    Promise.all(fetchPromises)
        .then(files => {
            sendWebSocketMessage({ type: 'update', files });
            ui.showToast('Update sent to bridge!', 'success');
        })
        .catch(error => {
            console.error('Failed to prepare update:', error);
            ui.showToast('Failed to prepare update.', 'error');
            ui.hideLoading();
        });
}

export function downloadBridge() {
    ui.showLoading();
    ui.showToast('Preparing download...', 'info');

    const zip = new JSZip();

    const readmeContent = `
# Minecraft Server Manager - Node.js Bridge
Thank you for downloading the server bridge! This Node.js application is the backend that allows the web interface to manage your Minecraft server.
## Instructions:
1.  **Prerequisites:** You need Node.js installed. Download from [https://nodejs.org/](https://nodejs.org/).
2.  **Unzip:** Extract this .zip file.
3.  **Install Dependencies:** Open a terminal or command prompt in the extracted folder and run: \`npm install\`
4.  **Add Server Jar:** Create a 'minecraft' folder and place your server .jar file inside. If you don't have one, the bridge will attempt to download the latest version for you on first start. You may need to run it once manually to accept the EULA if issues arise.
5.  **Run Bridge:** Start the server with: \`npm start\`
The manager backend will run on port 3001. Use the web UI to connect.
    `.trim().replace(/    /g, '');

    zip.file('README.md', readmeContent);
    zip.folder('minecraft'); // Create empty minecraft directory for user

    /* @tweakable The list of server-side files to include in the downloadable bridge .zip file. */
    const filesToFetch = [
        'server.js',
        'package.json',
        'server/config.js',
        'server/http.js',
        'server/minecraft-adapter.js',
        'server/minecraft-server.js',
        'server/websocket.js',
        'server/adapter/backup.js',
        'server/adapter/parser.js',
        'server/adapter/preparation.js',
        'server/adapter/downloader.js',
        'server/adapter/settings.js',
        'server/adapter/process-management.js',
        'server/adapter/updater.js'
    ];

    const fetchPromises = filesToFetch.map(file =>
        fetch(file)
        .then(res => {
            if (!res.ok) throw new Error(`Failed to fetch ${file}: ${res.statusText}`);
            return res.text();
        })
        .then(text => zip.file(file, text))
    );

    Promise.all(fetchPromises)
        .then(() => zip.generateAsync({ type: 'blob' }))
        .then(content => {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = zipFilename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
            ui.hideLoading();
            ui.showToast('Download complete!', 'success');
        })
        .catch(error => {
            console.error('Failed to create bridge zip:', error);
            ui.showToast('Failed to create download package.', 'error');
            ui.hideLoading();
        });
}

export function ping() {
    sendWebSocketMessage({ type: 'ping' });
}