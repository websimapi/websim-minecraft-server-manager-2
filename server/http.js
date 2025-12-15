const express = require('express');
const path =require('path');

function setupExpress(serverInstance) {
    const app = serverInstance.app;
    app.use(express.json());
    app.use(express.static(path.join(__dirname, '..')));

    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, '..', 'index.html'));
    });

    app.get('/api/status', (req, res) => {
        res.json({
            status: serverInstance.minecraft.serverStatus,
            stats: serverInstance.minecraft.stats,
            players: serverInstance.minecraft.players
        });
    });

    app.post('/api/upload', (req, res) => {
        // TODO: Handle file upload
        res.json({ success: true, message: 'File uploaded successfully' });
    });

    app.post('/api/backup', (req, res) => {
        serverInstance.minecraft.createBackup()
            .then(filename => {
                res.json({ success: true, filename });
            })
            .catch(error => {
                res.status(500).json({ success: false, error: error.message });
            });
    });

    app.get('/api/download-bridge', (req, res) => {
        res.status(400).json({
            success: false,
            message: 'This endpoint is deprecated. Bridge download is now handled client-side.'
        });
    });
}

module.exports = { setupExpress };

