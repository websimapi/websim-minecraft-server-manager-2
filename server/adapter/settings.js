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
        'enableFloodgate', 'floodgateAllowedIps', 'floodgatePlayerLink', 'floodgateRequireLink', 
        'enableViaVersion'
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

        // User requested robust default config for LAN/Offline
        const defaultConfig = `
bedrock:
  address: 0.0.0.0
  port: ${this.config.geyserPort || 19132}
  clone-remote-port: false
  # Security risk: Disables Bedrock auth. Required for LAN without Xbox.
  validate-bedrock-login: false

java:
  auth-type: ${this.config.geyserAuthType || 'offline'}

motd:
  primary-motd: Geyser
  secondary-motd: Another Geyser server.
  passthrough-motd: true
  max-players: 100
  passthrough-player-counts: true
  integrated-ping-passthrough: true
  ping-passthrough-interval: 3

gameplay:
  server-name: Geyser
  show-cooldown: title
  command-suggestions: true
  show-coordinates: true
  disable-bedrock-scaffolding: false
  nether-roof-workaround: false
  emotes-enabled: true
  unusable-space-block: minecraft:barrier
  enable-custom-content: true
  force-resource-packs: true
  enable-integrated-pack: true
  forward-player-ping: false
  xbox-achievements-enabled: false
  max-visible-custom-skulls: 128
  custom-skull-render-distance: 32

default-locale: system
log-player-ip-addresses: true

notify-on-new-bedrock-update: true

advanced:
  floodgate-key-file: key.pem
  java:
    use-direct-connection: true
    disable-compression: true
  bedrock:
    compression-level: 6

debug-mode: false
config-version: 5
`;
        fs.writeFileSync(geyserConfigPath, defaultConfig.trim());
        this.broadcast({ type: 'notification', message: 'Created optimized Geyser config (LAN mode).', level: 'success' });
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
        // Respect explicit config choice first, fallback to 'offline' for LAN stability if not set
        let desiredAuthType = this.config.geyserAuthType;
        if (!desiredAuthType) {
            desiredAuthType = 'offline'; // Default to offline for LAN stability as requested
        }

        const remoteBlockRegex = /(java:[\s\S]*?auth-type:\s*)(['"]?)(\w+)(['"]?)/;
        const match = configContent.match(remoteBlockRegex);

        if (match) {
            const currentAuth = match[3];
            if (currentAuth !== desiredAuthType) {
                configContent = configContent.replace(remoteBlockRegex, `$1${desiredAuthType}`);
                changed = true;
                this.broadcast({ type: 'notification', message: `Updated Geyser auth-type to: ${desiredAuthType}`, level: 'info' });
            }
        }

        // Ensure validate-bedrock-login is false for LAN if auth-type is offline
        if (desiredAuthType === 'offline') {
            const validateRegex = /(validate-bedrock-login:\s*)(true|false)/;
            if (validateRegex.test(configContent)) {
                 if (configContent.match(/(validate-bedrock-login:\s*)true/)) {
                     configContent = configContent.replace(validateRegex, '$1false');
                     changed = true;
                 }
            } else {
                 // If missing, add it to bedrock section
                 const bedrockSection = /(bedrock:[\s\S]*?port:.*)/;
                 configContent = configContent.replace(bedrockSection, '$1\n  validate-bedrock-login: false');
                 changed = true;
            }
        }

        if (changed) {
            fs.writeFileSync(geyserConfigPath, configContent, 'utf8');
            this.broadcast({ type: 'notification', message: 'Geyser configuration updated.', level: 'success' });
        }

        // Auto-fix: Copy key.pem from Floodgate to Geyser if missing
        if (this.config.enableFloodgate) {
            const geyserKeyPath = path.join(path.dirname(geyserConfigPath), 'key.pem');
            
            // Check possible Floodgate locations
            const floodgateKeyPaths = [
                path.join(this.config.minecraftDir, 'plugins', 'floodgate', 'key.pem'),
                path.join(this.config.minecraftDir, 'plugins', 'floodgate-spigot', 'key.pem')
            ];
            
            const existingKeyPath = floodgateKeyPaths.find(p => fs.existsSync(p));
            
            if (existingKeyPath && !fs.existsSync(geyserKeyPath)) {
                try {
                    fs.copyFileSync(existingKeyPath, geyserKeyPath);
                    this.broadcast({ type: 'notification', message: 'Copied key.pem from Floodgate to Geyser folder.', level: 'success' });
                } catch (e) {
                    console.error('Failed to copy key.pem:', e);
                }
            }
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

    // Create default config if missing
    if (!configPath) {
        configPath = path.join(this.config.minecraftDir, 'plugins', 'floodgate', 'config.yml');
        const pluginsDir = path.dirname(configPath);
        if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });

        // User requested specific Floodgate default for LAN
        const defaultConfig = 
`key-file-name: key.pem
username-prefix: "."
replace-spaces: true

disconnect:
  invalid-key: Please connect through the official Geyser
  invalid-arguments-length: Expected {} arguments, got {}. Is Geyser up-to-date?

player-link:
  enabled: false
  require-link: false
  enable-own-linking: false
  enable-global-linking: false
  allowed: true
  link-code-timeout: 300
  type: sqlite

metrics:
  enabled: true
  uuid: 77816080-e990-4351-8afc-7a614ab87feb

config-version: 3
`;
        fs.writeFileSync(configPath, defaultConfig);
        this.broadcast({ type: 'notification', message: 'Created default Floodgate configuration (LAN).', level: 'success' });
        created = true;
    }

    try {
        let content = fs.readFileSync(configPath, 'utf8');
        let changed = false;

        // 1. Fix known corruption artifacts (cleanup)
        let corruptionFixed = false;

        // Case A: concatenated list items '- "ip"- "ip"'
        while (content.match(/- ".*?"- "/)) {
            const newContent = content.replace(/- "(.*?)"- "(.*?)"/g, '- "$1"\n  - "$2"');
            if (newContent === content) break;
            content = newContent;
            corruptionFixed = true;
        }

        // Case B: concatenated key after list item '- "ip"next-key:'
        // This handles the specific formatting bug where a newline was missing before the next section
        if (content.match(/- ".*?"[a-z-]+:/)) {
             const newContent = content.replace(/(- ".*?")([a-z-]+:)/g, '$1\n$2');
             if (newContent !== content) {
                 content = newContent;
                 corruptionFixed = true;
             }
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

        // Enforce LAN defaults requested
        updateRegex(/^(key-file-name:\s*).*$/m, '$1key.pem');
        updateRegex(/^(username-prefix:\s*)(['"]?)(.*?)(['"]?)(\s*(?:#.*)?)$/m, '$1"."$5');
        
        // Disable Link
        updateRegex(/(player-link:[\s\S]*?enabled?:\s*)(true|false)/, '$1false');
        updateRegex(/(player-link:[\s\S]*?require-link:\s*)(true|false)/, '$1false');
        updateRegex(/(player-link:[\s\S]*?enable-global-linking:\s*)(true|false)/, '$1false');

        // Handle Allowed IPs: Explicitly clear them for LAN if empty/not provided
        // The user requested removing the allowed-ips section for LAN
        const allowedIpsRegex = /^allowed-ips:[\s\S]*?(?=\n[a-z]|$)/m;
        if (allowedIpsRegex.test(content)) {
             // Only if the config specifically wants to enforce IPs do we add them. 
             // But for LAN default we generally want to remove restrictions.
             // If the user supplied IPs in UI, we might add them.
             if (this.config.floodgateAllowedIps && Array.isArray(this.config.floodgateAllowedIps) && this.config.floodgateAllowedIps.length > 0) {
                 // Add them if present in UI
                 const ipList = this.config.floodgateAllowedIps.map(ip => ip.trim()).filter(ip => ip);
                 const newBlock = `allowed-ips:\n${ipList.map(ip => `  - "${ip}"`).join('\n')}`;
                 content = content.replace(allowedIpsRegex, newBlock);
                 changed = true;
             } else {
                 // Remove/Comment out if empty to avoid blocking LAN
                 content = content.replace(allowedIpsRegex, '# allowed-ips cleared for LAN');
                 changed = true;
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

