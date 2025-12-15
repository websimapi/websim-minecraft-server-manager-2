const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

module.exports.applyUpdate = function(files) {
    this.broadcast({ type: 'notification', message: 'Applying bridge update...', level: 'info' });
    
    try {
        files.forEach(file => {
            // bridge root is two levels up from server/adapter/
            const filePath = path.join(__dirname, '..', '..', file.path);
            const dir = path.dirname(filePath);
            
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            fs.writeFileSync(filePath, file.content);
            console.log(`Updated ${file.path}`);
        });

        this.broadcast({ type: 'notification', message: 'Update applied successfully. Restarting bridge...', level: 'success' });
        
        // Allow time for the WebSocket message to be sent before restarting
        setTimeout(() => {
            console.log('Restarting process...');
            
            // Kill the child Minecraft process if it's running, so the new bridge can take over properly
            if (this.minecraftProcess) {
                console.log('Stopping Minecraft server before bridge restart...');
                this.killChildProcess();
            }

            // Close the current web server to free the port
            if (this.serverInstance) {
                if (this.serverInstance.wss) {
                    this.serverInstance.wss.close();
                }
                if (this.serverInstance.httpServer) {
                    this.serverInstance.httpServer.close(() => {
                        console.log('Server closed');
                    });
                }
            } else {
                console.warn('Warning: Cannot access server instance to close port. Restart might fail if port is locked.');
            }

            // Spawn a new process with the same arguments
            // We use 'inherit' to keep using the same terminal
            const subprocess = spawn(process.argv[0], process.argv.slice(1), {
                detached: false,
                stdio: 'inherit',
                cwd: process.cwd()
            });

            subprocess.on('error', (err) => {
                console.error('Failed to restart subprocess:', err);
            });

            // When the new process exits, this parent process exits too
            subprocess.on('close', (code) => {
                process.exit(code);
            });
            
            // We intentionally do NOT exit this process immediately.
            // It stays alive to pipe I/O for the child process.

        }, 1000);

    } catch (error) {
        console.error('Update failed:', error);
        this.broadcast({ type: 'error', message: `Update failed: ${error.message}` });
    }
};

