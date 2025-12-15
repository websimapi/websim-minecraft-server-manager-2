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
        'serverType', 'minecraftVersion', 'maxPlayers', 'mcPort', 'geyserPort',
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
    
    if (settings.geyserPort || settings.enableGeyser || settings.enableFloodgate) this.configureGeyser();

    this.broadcast({ type: 'notification', message: 'Settings updated successfully. A restart is required for some changes to take effect.', level: 'success' });
    this.broadcast({ type: 'settings', config: this.config });
};

module.exports.updateServerProperties = function(settings) {
    const serverPropsPath = path.join(this.config.minecraftDir, 'server.properties');
    if (fs.existsSync(serverPropsPath)) {
        let content = fs.readFileSync(serverPropsPath, 'utf8');
        let changed = false;

        if (settings.mcPort) {
            const portRegex = /^server-port=\d*/m;
            if (portRegex.test(content)) {
                content = content.replace(portRegex, `server-port=${settings.mcPort}`);
                changed = true;
            }
        }
        if (settings.maxPlayers) {
            const maxPlayersRegex = /^max-players=\d*/m;
            if (maxPlayersRegex.test(content)) {
                content = content.replace(maxPlayersRegex, `max-players=${settings.maxPlayers}`);
                changed = true;
            }
        }
        
        // If Floodgate is enabled, ensure server is in offline mode to allow 'offline' auth-type from Geyser to work
        // without authentication errors from the Java server.
        if (this.config.enableFloodgate) {
            const onlineModeRegex = /^online-mode=.*$/m;
            if (onlineModeRegex.test(content)) {
                if (!content.match(/^online-mode=false$/m)) {
                    content = content.replace(onlineModeRegex, 'online-mode=false');
                    changed = true;
                }
            }
        }

        if (changed) {
            fs.writeFileSync(serverPropsPath, content);
        }
    }
};

module.exports.configureGeyser = function() {
    if (!this.config.enableGeyser) return;

    // Check possible config locations
    const possiblePaths = [
        path.join(this.config.minecraftDir, 'plugins', 'Geyser-Spigot', 'config.yml'),
        path.join(this.config.minecraftDir, 'plugins', 'Geyser', 'config.yml')
    ];

    const geyserConfigPath = possiblePaths.find(p => fs.existsSync(p));

    if (!geyserConfigPath) {
        this.broadcast({ type: 'notification', message: 'Geyser config not found. Waiting for it to be generated.', level: 'warning' });
        return;
    }

    try {
        let configContent = fs.readFileSync(geyserConfigPath, 'utf8');
        let changed = false;

        // Update Port
        if (this.config.geyserPort) {
            const bedrockPortRegex = /(bedrock:[\s\S]*?port:\s*)(\d+)/;
            const match = configContent.match(bedrockPortRegex);
            if (match && match[2] !== String(this.config.geyserPort)) {
                configContent = configContent.replace(bedrockPortRegex, `$1${this.config.geyserPort}`);
                changed = true;
            }
        }

        // Update Auth Type based on Floodgate setting
        // Use strict regex to avoid partial matches
        const authTypeRegex = /^(\s*auth-type:\s*)(['"]?)(\w+)(['"]?)/m;
        const match = configContent.match(authTypeRegex);
        
        if (match) {
            const currentAuthType = match[3];
            // 'offline' allows Bedrock clients to join without signing into Xbox.
            const desiredAuthType = this.config.enableFloodgate ? 'offline' : 'online';
            
            if (currentAuthType !== desiredAuthType) {
                configContent = configContent.replace(authTypeRegex, `$1${desiredAuthType}`);
                changed = true;
                this.broadcast({ type: 'notification', message: `Updated Geyser auth-type to: ${desiredAuthType}`, level: 'info' });
            }
        } else {
             // Fallback for non-multiline matching just in case
             const fallbackRegex = /(\s*auth-type:\s*)(['"]?)(\w+)(['"]?)/;
             if (fallbackRegex.test(configContent)) {
                 const desiredAuthType = this.config.enableFloodgate ? 'offline' : 'online';
                 configContent = configContent.replace(fallbackRegex, `$1${desiredAuthType}`);
                 changed = true;
                 this.broadcast({ type: 'notification', message: `Updated Geyser auth-type (fallback) to: ${desiredAuthType}`, level: 'info' });
             }
        }

        if (changed) {
            fs.writeFileSync(geyserConfigPath, configContent, 'utf8');
            this.broadcast({ type: 'notification', message: 'Geyser configuration updated.', level: 'success' });
        }
    } catch (error) {
        console.error(`Failed to configure Geyser: ${error}`);
        this.broadcast({ type: 'error', message: `Failed to auto-configure Geyser: ${error.message}` });
    }
};

