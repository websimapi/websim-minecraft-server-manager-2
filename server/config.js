const path = require('path');
const fs = require('fs');

/* @tweakable server configuration */
let serverConfig = {
    bridgePort: 3001,
    mcPort: 25565,
    minecraftDir: path.join(__dirname, '..', 'minecraft'),
    backupsDir: path.join(__dirname, '..', 'backups'),
    javaPath: 'java',
    serverJar: 'server.jar',
    bedrockServerExecutable: 'bedrock_server',
    maxRam: '2G',
    serverType: 'java', // 'java' or 'bedrock'
    minecraftVersion: '1.21.4', // specific version or 'latest'
    autoStart: false,
    /* @tweakable Enable Geyser to allow Bedrock clients to connect */
    enableGeyser: false,
    /* @tweakable Port for Geyser (Bedrock) clients. Default is 19132. */
    geyserPort: 19132,
    /* @tweakable Automatically update Geyser/Floodgate on server start to match server version */
    autoUpdateGeyser: true,
    /* @tweakable Enable Floodgate to allow Bedrock clients without a Java account */
    enableFloodgate: false,
    /* @tweakable Enable ViaVersion to allow older/newer client connections */
    enableViaVersion: false
};

const configPath = path.join(__dirname, 'config.json');
if (fs.existsSync(configPath)) {
    try {
        const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        
        // Migration: Handle old 'port' config which conflated bridge and MC ports
        if (savedConfig.port) {
            if (savedConfig.port === 3001) {
                savedConfig.bridgePort = 3001;
            } else {
                // If it's not 3001, it was likely the MC port
                savedConfig.mcPort = savedConfig.port;
                savedConfig.bridgePort = 3001; // Restore default bridge port to prevent crash
            }
            delete savedConfig.port;
        }

        serverConfig = { ...serverConfig, ...savedConfig };
    } catch (e) {
        console.error("Error reading saved config.json, using defaults.", e);
    }
}

/* @tweakable Minecraft server download URLs and settings */
const downloadConfig = {
    java: {
        versionManifestUrl: 'https://launchermeta.mojang.com/mc/game/version_manifest.json',
        latestVersionType: 'release' // 'release' or 'snapshot'
    },
    bedrock: {
        downloadPageUrl: 'https://www.minecraft.net/en-us/download/server/bedrock',
        downloadLinkRegex: /https:\/\/minecraft\.azureedge\.net\/bin-linux\/bedrock-server-([\d\.]+)\.zip/
    },
    /* @tweakable PaperMC download API settings */
    paper: {
        apiUrl: 'https://api.papermc.io/v2/projects/paper',
    },
    /* @tweakable Geyser download settings */
    geyser: {
        /* @tweakable URL for Geyser plugin download. It's recommended to use the official API endpoint. */
        downloadUrl: 'https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/spigot',
        /* @tweakable Filename for the downloaded Geyser plugin JAR. Must match the target server type (e.g., spigot). */
        filename: 'Geyser-Spigot.jar'
    },
    /* @tweakable Floodgate download settings */
    floodgate: {
        /* @tweakable URL for Floodgate plugin download. It's recommended to use the official API endpoint. */
        downloadUrl: 'https://download.geysermc.org/v2/projects/floodgate/versions/latest/builds/latest/downloads/spigot',
        /* @tweakable Filename for the downloaded Floodgate plugin JAR. */
        filename: 'floodgate-spigot.jar'
    },
    /* @tweakable ViaVersion download settings */
    viaversion: {
        apiUrl: 'https://api.modrinth.com/v2/project/viaversion/version',
        filename: 'ViaVersion.jar'
    }
};

/** @tweakable The server software to use when Geyser is enabled. Must be a plugin-compatible server like 'paper'. */
const geyserServerType = 'paper';

/** @tweakable The compression level for zip backups (0-9). 9 is highest compression. */
const backupCompressionLevel = 1; // Lowered for performance, 9 can be very slow

/** @tweakable For Paper servers, this disables the plugin remapper. FALSE is recommended for Paper 1.20.6+ and Geyser. */
const disablePaperPluginRemapper = false;

module.exports = {
    serverConfig,
    downloadConfig,
    backupCompressionLevel,
    geyserServerType,
    disablePaperPluginRemapper
};