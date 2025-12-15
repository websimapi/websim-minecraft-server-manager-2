const { serverConfig, downloadConfig, backupCompressionLevel, geyserServerType, disablePaperPluginRemapper } = require('./config.js');
const processManagement = require('./adapter/process-management.js');
const parser           = require('./adapter/parser.js');
const downloader       = require('./adapter/downloader.js');
const backupManager    = require('./adapter/backup.js');
const preparer         = require('./adapter/preparation.js');
const settingsManager  = require('./adapter/settings.js');
const updater          = require('./adapter/updater.js');

class MinecraftAdapter {
    constructor(broadcastCallback) {
        this.broadcast       = broadcastCallback;
        this.serverInstance  = null;
        this.config          = serverConfig;
        this.downloadConfig  = downloadConfig;
        this.minecraftProcess= null;
        this.serverStatus    = 'offline';
        this.players         = [];
        this.stats           = {
            players: 0,
            uptime:  '00:00:00',
            ram:     '0 MB',
            tps:     '20.0'
        };
        this.startTime       = null;
    }

    setServerInstance(instance) {
        this.serverInstance = instance;
    }
}

Object.assign(
    MinecraftAdapter.prototype,
    processManagement,
    parser,
    downloader,
    backupManager,
    preparer,
    settingsManager,
    updater
);

module.exports = MinecraftAdapter;