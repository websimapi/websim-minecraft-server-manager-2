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
        // Auto-update if configured (default true) to prevent version mismatch errors
        const forceUpdate = this.config.autoUpdateGeyser !== false;
        
        await this.downloadGeyserPlugin(forceUpdate);
        if (this.config.enableFloodgate) {
            await this.downloadFloodgatePlugin(forceUpdate);
        }
    }
};

