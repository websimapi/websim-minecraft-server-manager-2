const fs   = require('fs');
const path = require('path');

module.exports.updateSettings = function(settings) {
    let changed = false;

    // Handle RAM conversion from MB (int) to String with suffix
    if (settings.ram) {
        const newRam = `${settings.ram}M`;
        if (this.config.maxRam !== newRam) {
            this.config.maxRam = newRam;
            changed = true;
        }
    }
    
    // Merge other settings
    const keysToCheck = [
        'serverType', 'minecraftVersion', 'maxPlayers', 'mcPort', 
        'autoStart', 'enableGeyser', 'autoUpdateGeyser', 
        'enableFloodgate', 'enableViaVersion'
    ];

    keysToCheck.forEach(key => {
        if (settings[key] !== undefined && this.config[key] !== settings[key]) {
            this.config[key] = settings[key];
            changed = true;
        }
    });

    if (!changed) return;
    
    // Persist to config.json
    // We filter out complex objects or temporary state if any, but config is mostly flat
    fs.writeFileSync(path.join(__dirname, '..', 'config.json'), JSON.stringify(this.config, null, 2));
    
    if (settings.mcPort || settings.maxPlayers) this.updateServerProperties(settings);
    
    this.broadcast({ type: 'notification', message: 'Settings updated successfully. A restart is required for some changes to take effect.', level: 'success' });
    this.broadcast({ type: 'settings', config: this.config });
};

module.exports.updateServerProperties = function(settings) {
    const serverPropsPath = path.join(this.config.minecraftDir, 'server.properties');
    if (fs.existsSync(serverPropsPath)) {
        let content = fs.readFileSync(serverPropsPath, 'utf8');
        if (settings.mcPort)     content = content.replace(/server-port=\d*/, `server-port=${settings.mcPort}`);
        if (settings.maxPlayers) content = content.replace(/max-players=\d*/, `max-players=${settings.maxPlayers}`);
        fs.writeFileSync(serverPropsPath, content);
    }
};

module.exports.configureGeyser = function() {
    if (!this.config.enableGeyser || !this.config.enableFloodgate) return;

    const geyserConfigPath = path.join(this.config.minecraftDir, 'plugins', 'Geyser-Spigot', 'config.yml');
    if (!fs.existsSync(geyserConfigPath)) {
        this.broadcast({ type: 'notification', message: 'Geyser config not found. Waiting for it to be generated.', level: 'warning' });
        return;
    }

    try {
        let configContent = fs.readFileSync(geyserConfigPath, 'utf8');
        const targetAuthType = 'floodgate';
        const authTypeRegex  = /auth-type:\s*\w+/;

        if (/auth-type:\s*floodgate/.test(configContent)) return;
        if (authTypeRegex.test(configContent)) {
            configContent = configContent.replace(authTypeRegex, `auth-type: ${targetAuthType}`);
        } else {
            this.broadcast({ type: 'error', message: 'Could not find "auth-type" in Geyser config.' });
            return;
        }

        fs.writeFileSync(geyserConfigPath, configContent, 'utf8');
        this.broadcast({ type: 'notification', message: 'Geyser config updated for Floodgate. A server restart is recommended.', level: 'success' });
    } catch (error) {
        console.error(`Failed to configure Geyser: ${error}`);
        this.broadcast({ type: 'error', message: `Failed to auto-configure Geyser: ${error.message}` });
    }
};

