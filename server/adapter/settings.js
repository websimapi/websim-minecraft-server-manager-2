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
        'autoStart', 'enableGeyser', 'autoUpdateGeyser', 'geyserAuthType',
        'enableFloodgate', 'floodgateAllowedIps', 'enableViaVersion'
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
    
    if (settings.geyserPort || settings.enableGeyser || settings.enableFloodgate || settings.geyserAuthType || settings.floodgateAllowedIps) {
        this.configureGeyser();
        if (this.config.enableFloodgate) this.configureFloodgate();
    }

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
    if (!this.config.enableGeyser) return false;

    const possiblePaths = [
        path.join(this.config.minecraftDir, 'plugins', 'Geyser-Spigot', 'config.yml'),
        path.join(this.config.minecraftDir, 'plugins', 'Geyser', 'config.yml')
    ];

    const geyserConfigPath = possiblePaths.find(p => fs.existsSync(p));

    if (!geyserConfigPath) {
        this.broadcast({ type: 'notification', message: 'Geyser config not found (yet). Skipping auto-configuration.', level: 'warning' });
        return false;
    }

    try {
        let configContent = fs.readFileSync(geyserConfigPath, 'utf8');
        let changed = false;

        // Update Bedrock Port
        if (this.config.geyserPort) {
            const bedrockPortRegex = /(bedrock:[\s\S]*?port:\s*)(\d+)/;
            const match = configContent.match(bedrockPortRegex);
            if (match && match[2] !== String(this.config.geyserPort)) {
                configContent = configContent.replace(bedrockPortRegex, `$1${this.config.geyserPort}`);
                changed = true;
            }
        }

        // Update Auth Type
        // We prioritize the explicit user setting 'geyserAuthType' if present.
        // Fallback: If Floodgate enabled, default to 'floodgate'. Else 'online'.
        let desiredAuthType = this.config.geyserAuthType;
        if (!desiredAuthType) {
            desiredAuthType = this.config.enableFloodgate ? 'floodgate' : 'online';
        }

        // Robust Regex: Look for 'remote:' block, then 'auth-type:' inside it.
        const remoteBlockRegex = /(remote:[\s\S]*?auth-type:\s*)(['"]?)(\w+)(['"]?)/;
        const match = configContent.match(remoteBlockRegex);

        if (match) {
            const currentAuth = match[3];
            if (currentAuth !== desiredAuthType) {
                // We use '$1' + desiredAuthType to preserve indentation and keys, replacing the value. 
                // We intentionally drop the quotes (groups 2 and 4) from replacement to ensure clean value.
                configContent = configContent.replace(remoteBlockRegex, `$1${desiredAuthType}`);
                changed = true;
                this.broadcast({ type: 'notification', message: `Updated Geyser auth-type to: ${desiredAuthType}`, level: 'info' });
            }
        } else {
             // Fallback: search for simple "auth-type: value" if remote block match fails
             const simpleAuthRegex = /(auth-type:\s*)(['"]?)(\w+)(['"]?)/;
             const simpleMatch = configContent.match(simpleAuthRegex);
             if (simpleMatch && simpleMatch[3] !== desiredAuthType) {
                 configContent = configContent.replace(simpleAuthRegex, `$1${desiredAuthType}`);
                 changed = true;
                 this.broadcast({ type: 'notification', message: `Updated Geyser auth-type (fallback) to: ${desiredAuthType}`, level: 'info' });
             }
        }

        if (changed) {
            fs.writeFileSync(geyserConfigPath, configContent, 'utf8');
            this.broadcast({ type: 'notification', message: 'Geyser configuration updated.', level: 'success' });
        }
        return changed;
    } catch (error) {
        console.error(`Failed to configure Geyser: ${error}`);
        this.broadcast({ type: 'error', message: `Failed to auto-configure Geyser: ${error.message}` });
        return false;
    }
};

module.exports.configureFloodgate = function() {
    if (!this.config.enableFloodgate) return false;

    const possiblePaths = [
        path.join(this.config.minecraftDir, 'plugins', 'floodgate', 'config.yml'),
        path.join(this.config.minecraftDir, 'plugins', 'floodgate-spigot', 'config.yml')
    ];

    const configPath = possiblePaths.find(p => fs.existsSync(p));
    if (!configPath) return false;

    try {
        let content = fs.readFileSync(configPath, 'utf8');
        let changed = false;

        // 1. Ensure player-link enable is false for offline/floodgate setup by default
        const playerLinkRegex = /(player-link:[\s\S]*?enable:\s*)(true|false)/;
        const plMatch = content.match(playerLinkRegex);
        if (plMatch && plMatch[2] === 'true') {
            content = content.replace(playerLinkRegex, '$1false');
            changed = true;
            this.broadcast({ type: 'notification', message: 'Updated Floodgate player-link to false', level: 'info' });
        }

        // 2. Ensure disconnect invalid-key is false
        const invalidKeyRegex = /(disconnect:[\s\S]*?invalid-key:\s*)(true|false)/;
        const ikMatch = content.match(invalidKeyRegex);
        if (ikMatch && ikMatch[2] === 'true') {
            content = content.replace(invalidKeyRegex, '$1false');
            changed = true;
            this.broadcast({ type: 'notification', message: 'Updated Floodgate disconnect.invalid-key to false', level: 'info' });
        }

        // 3. Update Allowed IPs for offline access
        if (this.config.floodgateAllowedIps && Array.isArray(this.config.floodgateAllowedIps)) {
             const ips = this.config.floodgateAllowedIps;
             const blockMatch = content.match(/^allowed-ips:(?:\s*\[\]|\s*\n(?:\s+-.*)+|.*)/m);
             
             if (blockMatch) {
                  const currentBlock = blockMatch[0];
                  // Construct new block
                  const newString = `allowed-ips:${ips.length > 0 ? '\n' + ips.map(ip => `  - "${ip}"`).join('\n') : ' []'}`;
                  
                  if (currentBlock.trim() !== newString.trim()) {
                       content = content.replace(blockMatch[0], newString);
                       changed = true;
                       this.broadcast({ type: 'notification', message: 'Updated Floodgate Allowed IPs whitelist', level: 'info' });
                  }
             }
        }

        if (changed) {
            fs.writeFileSync(configPath, content, 'utf8');
            this.broadcast({ type: 'notification', message: 'Floodgate configuration updated.', level: 'success' });
        }
        return changed;
    } catch (error) {
        console.error(`Failed to configure Floodgate: ${error}`);
        return false;
    }
};

