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
        // Only force update if explicitly true. Default is now false to prevent overwriting user changes or wasting bandwidth
        const forceUpdate = this.config.autoUpdateGeyser === true;
        
        await this.downloadGeyserPlugin(forceUpdate);
        if (this.config.enableFloodgate) {
            await this.downloadFloodgatePlugin(forceUpdate);
        }
    }
    
    if (this.config.enableViaVersion) {
        const forceUpdate = this.config.autoUpdateGeyser !== false;
        await this.downloadViaVersionPlugin(forceUpdate);
    }
};

