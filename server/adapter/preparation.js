const fs   = require('fs');
const path = require('path');
const { geyserServerType } = require('../config.js');

module.exports.prepareJavaServer = async function() {
    const serverJarPath = path.join(this.config.minecraftDir, this.config.serverJar);

    if (this.config.enableGeyser) {
        this.broadcast({ type: 'notification', message: `Geyser requires a plugin-compatible server. Preparing ${geyserServerType}...`, level: 'info' });
        if (!fs.existsSync(serverJarPath) || !this.config.serverJar.toLowerCase().includes(geyserServerType.toLowerCase())) {
            if (geyserServerType === 'paper') {
                await this.downloadPaperServer();
            } else {
                await this.downloadVanillaServer();
            }
        }
        await this.preparePlugins();
    } else {
        this.broadcast({ type: 'notification', message: 'Preparing vanilla server...', level: 'info' });
        if (!fs.existsSync(serverJarPath) || this.config.serverJar.toLowerCase().includes('paper')) {
            await this.downloadVanillaServer();
        }
    }
};

module.exports.preparePlugins = async function() {
    const pluginsDir = path.join(this.config.minecraftDir, 'plugins');
    if (!fs.existsSync(pluginsDir)) {
        fs.mkdirSync(pluginsDir, { recursive: true });
    }
    if (this.config.enableGeyser) {
        // Only force update if explicitly true AND file is old or missing
        // This prevents re-downloading on every restart loop
        let forceUpdate = this.config.autoUpdateGeyser === true;
        
        if (forceUpdate) {
            const geyserPath = path.join(pluginsDir, this.downloadConfig.geyser.filename);
            if (fs.existsSync(geyserPath)) {
                try {
                    const stats = fs.statSync(geyserPath);
                    const ageMinutes = (Date.now() - stats.mtimeMs) / 1000 / 60;
                    // If file is less than 60 minutes old, assume it's fresh enough for this session
                    if (ageMinutes < 60) {
                        forceUpdate = false;
                        this.broadcast({ type: 'notification', message: 'Geyser is up-to-date (cached).', level: 'info' });
                    }
                } catch (e) {
                    console.error('Error checking file age:', e);
                }
            }
        }
        
        await this.downloadGeyserPlugin(forceUpdate);
        
        // Ensure configuration exists BEFORE server start to prevent defaults/race conditions
        this.configureGeyser();

        if (this.config.enableFloodgate) {
            await this.downloadFloodgatePlugin(forceUpdate);
            this.configureFloodgate();
        }
    }
    
    if (this.config.enableViaVersion) {
        const forceUpdate = this.config.autoUpdateGeyser !== false; // Reuse setting or separate? Reusing for now.
        // Similar cache check for ViaVersion if needed, but it's less critical.
        await this.downloadViaVersionPlugin(forceUpdate);
    }
};

