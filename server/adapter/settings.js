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

    // Always persist to config.json
    fs.writeFileSync(path.join(__dirname, '..', 'config.json'), JSON.stringify(this.config, null, 2));
    
    // Broadcast new state to UI
    this.broadcast({ type: 'settings', config: this.config });

    if (this.serverStatus === 'online') {
        this.broadcast({ type: 'notification', message: 'Stopping server to apply new settings...', level: 'warning' });
        this.pendingSettingsRestart = true;
        this.stop();
    } else {
        this.applySettingsToFiles();
        this.broadcast({ type: 'notification', message: 'Settings saved.', level: 'success' });
    }
};

module.exports.applySettingsToFiles = function() {
    this.updateServerProperties();
    if (this.config.enableGeyser) {
        this.configureGeyser();
    }
    if (this.config.enableFloodgate) {
        this.configureFloodgate();
    }
};

module.exports.updateServerProperties = function() {
    const serverPropsPath = path.join(this.config.minecraftDir, 'server.properties');
    if (fs.existsSync(serverPropsPath)) {
        let content = fs.readFileSync(serverPropsPath, 'utf8');
        let changed = false;

        const portRegex = /^server-port=\d*/m;
        if (portRegex.test(content)) {
            const currentPort = content.match(portRegex)[0];
            if (currentPort !== `server-port=${this.config.mcPort}`) {
                content = content.replace(portRegex, `server-port=${this.config.mcPort}`);
                changed = true;
            }
        }

        const maxPlayersRegex = /^max-players=\d*/m;
        if (maxPlayersRegex.test(content)) {
            const currentMax = content.match(maxPlayersRegex)[0];
            if (currentMax !== `max-players=${this.config.maxPlayers}`) {
                content = content.replace(maxPlayersRegex, `max-players=${this.config.maxPlayers}`);
                changed = true;
            }
        }
        
        // Force offline mode if Geyser/Floodgate are enabled to avoid auth issues on the Java end
        if (this.config.enableGeyser || this.config.enableFloodgate) {
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

    let geyserConfigPath = possiblePaths.find(p => fs.existsSync(p));

    // Auto-create config if missing to prevent restart loops waiting for it
    if (!geyserConfigPath) {
        geyserConfigPath = path.join(this.config.minecraftDir, 'plugins', 'Geyser-Spigot', 'config.yml');
        const dir = path.dirname(geyserConfigPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        // Minimal config that Geyser will respect and hydrate
        const defaultConfig = `
bedrock:
  address: 0.0.0.0
  port: ${this.config.geyserPort || 19132}
remote:
  address: 127.0.0.1
  port: ${this.config.mcPort || 25565}
  auth-type: ${this.config.geyserAuthType || (this.config.enableFloodgate ? 'floodgate' : 'online')}
`;
        fs.writeFileSync(geyserConfigPath, defaultConfig.trim());
        this.broadcast({ type: 'notification', message: 'Created minimal Geyser config.', level: 'success' });
        // We just created it with correct values, no need to parse/edit immediately unless logic below finds discrepancies
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
        // If Floodgate is enabled, we prioritize 'floodgate' auth type to allow the hybrid setup.
        let desiredAuthType = this.config.geyserAuthType;
        if (this.config.enableFloodgate) {
            desiredAuthType = 'floodgate';
        } else if (!desiredAuthType) {
            desiredAuthType = 'online';
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

    let configPath = possiblePaths.find(p => fs.existsSync(p));
    let created = false;

    // Create default config if missing to prevent startup errors or race conditions
    if (!configPath) {
        configPath = path.join(this.config.minecraftDir, 'plugins', 'floodgate', 'config.yml');
        const pluginsDir = path.dirname(configPath);
        if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });

        const ips = this.config.floodgateAllowedIps || [];
        const allowedIpsBlock = ips.length > 0 ? '\n' + ips.map(ip => `  - "${ip}"`).join('\n') : ' []';

        const defaultConfig = 
`# Floodgate Configuration (Generated by Manager)
key-file-name: key.pem
username-prefix: "."
replace-spaces: true
allowed-ips:${allowedIpsBlock}
disconnect:
  invalid-key: Please connect through the official Geyser
  invalid-arguments-length: Expected {} arguments, got {}. Is Geyser up-to-date?
player-link:
  enabled: true
  require-link: true
  enable-own-linking: false
  allowed: true
  link-code-timeout: 300
  type: sqlite
  enable-global-linking: true
metrics:
  enabled: true
  uuid: 77816080-e990-4351-8afc-7a614ab87feb
config-version: 3
`;
        fs.writeFileSync(configPath, defaultConfig);
        this.broadcast({ type: 'notification', message: 'Created default Floodgate configuration.', level: 'success' });
        created = true;
    }

    try {
        let content = fs.readFileSync(configPath, 'utf8');
        let changed = false;

        // 1. Fix known corruption artifacts (e.g. concatenated lines like '- "ip"- "ip"')
        // We use a loop to catch multiple occurrences or chained corruptions
        let corruptionFixed = false;
        while (content.match(/- ".*?"- "/)) {
            const newContent = content.replace(/- "(.*?)"- "(.*?)"/g, '- "$1"\n  - "$2"');
            if (newContent === content) break; // Should not happen if match passed, but safety break
            content = newContent;
            corruptionFixed = true;
        }
        if (corruptionFixed) {
            changed = true;
            this.broadcast({ type: 'notification', message: 'Fixed malformed Floodgate config.', level: 'warning' });
        }

        // Helper to update simple values
        const updateRegex = (regex, replacement, message) => {
            if (regex.test(content)) {
                const newContent = content.replace(regex, replacement);
                if (newContent !== content) {
                    content = newContent;
                    changed = true;
                    if (message) this.broadcast({ type: 'notification', message, level: 'info' });
                }
            }
        };

        // 0. Base Configuration
        updateRegex(/^(key-file-name:\s*).*$/m, '$1key.pem', 'Set Floodgate key-file-name');
        updateRegex(/^(username-prefix:\s*)(['"]?)(.*?)(['"]?)(\s*(?:#.*)?)$/m, '$1"."$5', 'Set Floodgate username-prefix');
        updateRegex(/^(replace-spaces:\s*)(true|false)/m, '$1true');

        // 1. Ensure player-link enabled is TRUE
        updateRegex(/(player-link:[\s\S]*?enabled?:\s*)(true|false)/, '$1true');

        // 2. Ensure require-link is TRUE (Enforce auth for external, bypass for allowed-ips)
        updateRegex(/(player-link:[\s\S]*?require-link:\s*)(true|false)/, '$1true');

        // 3. Update Allowed IPs for offline access (Smart Set Comparison)
        if (this.config.floodgateAllowedIps && Array.isArray(this.config.floodgateAllowedIps)) {
             const desiredIps = new Set(this.config.floodgateAllowedIps.map(ip => ip.trim()).filter(ip => ip.length > 0));
             
             // Robust block matching: Find 'allowed-ips:' and capture everything up to the next root key
             const ipRegex = /^allowed-ips:(\s*(-.*(\r?\n)?)*)*/m;
             const match = content.match(ipRegex);
             
             let needsUpdate = false;
             
             if (match) {
                 const existingBlock = match[0];
                 const extractedIps = [];
                 // More permissive regex to catch messy formatting
                 const lineRegex = /-\s*["']?([^"'\r\n]+?)["']?\s*$/gm;
                 let m;
                 while ((m = lineRegex.exec(existingBlock)) !== null) {
                     // Remove potential trailing quotes if regex didn't catch them cleanly
                     let ip = m[1].replace(/["']$/, '').trim();
                     extractedIps.push(ip);
                 }
                 const existingSet = new Set(extractedIps);
                 
                 // Compare sets
                 if (desiredIps.size !== existingSet.size) {
                     needsUpdate = true;
                 } else {
                     for (const ip of desiredIps) {
                         if (!existingSet.has(ip)) {
                             needsUpdate = true;
                             break;
                         }
                     }
                 }
             } else {
                 needsUpdate = true;
             }

             if (needsUpdate) {
                 const ipList = [...desiredIps];
                 const newBlock = `allowed-ips:${ipList.length > 0 ? '\n' + ipList.map(ip => `  - "${ip}"`).join('\n') : ' []'}`;
                 
                 if (match) {
                     // Replace only the matched block
                     content = content.replace(match[0], newBlock);
                 } else {
                     // Append if missing, ensuring newline
                     if (!content.includes('allowed-ips:')) {
                         content += `\n${newBlock}\n`;
                     }
                 }
                 changed = true;
                 this.broadcast({ type: 'notification', message: 'Updated Floodgate Allowed IPs', level: 'info' });
             }
        }

        if (changed || created) {
            fs.writeFileSync(configPath, content, 'utf8');
            if (changed) this.broadcast({ type: 'notification', message: 'Floodgate configuration updated.', level: 'success' });
        }
        return changed || created;
    } catch (error) {
        console.error(`Failed to configure Floodgate: ${error}`);
        return false;
    }
};

