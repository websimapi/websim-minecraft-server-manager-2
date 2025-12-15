const fs       = require('fs');
const path     = require('path');
const archiver = require('archiver');
const { backupCompressionLevel } = require('../config.js');

module.exports.createBackup = function() {
    return new Promise((resolve, reject) => {
        const timestamp      = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFilename = `backup-${timestamp}.zip`;
        const backupPath     = path.join(this.config.backupsDir, backupFilename);

        if (!fs.existsSync(this.config.backupsDir)) {
            fs.mkdirSync(this.config.backupsDir, { recursive: true });
        }

        const output  = fs.createWriteStream(backupPath);
        const archive = archiver('zip', { zlib: { level: backupCompressionLevel } });

        output.on('close', () => {
            this.broadcast({ type: 'notification', message: `Backup created: ${backupFilename}`, level: 'success' });
            resolve(backupFilename);
        });

        archive.on('error', (err) => {
            this.broadcast({ type: 'error', message: `Backup failed: ${err.message}` });
            reject(err);
        });

        archive.pipe(output);
        archive.glob('**', {
            cwd: this.config.minecraftDir,
            ignore: ['node_modules/**']
        });
        archive.finalize();
    });
};