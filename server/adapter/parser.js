module.exports.parseServerOutput = function(output) {
    const lines = output.split('\n');
    lines.forEach(line => {
        // pause detection: stop TPS polling and broadcast paused state
        if (line.includes('Server empty') && line.includes('pausing')) {
            if (this.debugInterval) {
                clearInterval(this.debugInterval);
                this.debugInterval = null;
            }
            if (this.debugTimeout) {
                clearTimeout(this.debugTimeout);
                this.debugTimeout = null;
            }
            this.stats.tps = 'Paused';
            this.broadcast({
                type: 'status',
                online: this.serverStatus === 'online',
                stats: this.stats,
                startTime: this.startTime
            });
            return; // skip further parsing for this line
        }

        if (line.includes('joined the game')) {
            const playerName = line.match(/(\w+) joined the game/)?.[1];
            if (playerName && !this.players.find(p => p.name === playerName)) {
                this.players.push({ name: playerName, status: 'Online' });
                this.updatePlayersList();
                // Resume TPS profiling if it was paused and players are back
                if (this.players.length > 0 && this.serverStatus === 'online' && !this.debugInterval) {
                    // Schedule new TPS profiling loop
                    this.debugInterval = setInterval(() => {
                        this.sendCommand('debug start');
                        this.stats.tps = 'loading';
                        this.broadcast({
                            type: 'status',
                            online: this.serverStatus === 'online',
                            stats: this.stats,
                            startTime: this.startTime
                        });
                        this.debugTimeout = setTimeout(() => {
                            this.sendCommand('debug stop');
                        }, 20000);
                    }, 40000);
                    // Kick off immediate TPS measurement
                    this.sendCommand('debug start');
                    this.stats.tps = 'loading';
                    this.broadcast({
                        type: 'status',
                        online: this.serverStatus === 'online',
                        stats: this.stats,
                        startTime: this.startTime
                    });
                    this.debugTimeout = setTimeout(() => {
                        this.sendCommand('debug stop');
                    }, 20000);
                }
            }
        } else if (line.includes('left the game')) {
            const playerName = line.match(/(\w+) left the game/)?.[1];
            if (playerName) {
                this.players = this.players.filter(p => p.name !== playerName);
                this.updatePlayersList();
            }
        }
        if (line.includes('Done') && line.includes('For help, type "help"')) {
            this.broadcast({ type: 'notification', message: 'Server fully loaded and ready', level: 'success' });
        }
        // Parse TPS metrics if present in console output
        if (line.includes('TPS from last')) {
            const match = line.match(/TPS from last 1m, 5m, 15m: ([\d\.]+)/);
            if (match) {
                this.stats.tps = match[1];
            }
        }
        // Parse TPS from debug profiling output
        if (line.includes('Stopped tick profiling after') && line.includes('tick(s) per second')) {
            const matchDebug = line.match(/\(([\d.]+) tick\(s\) per second\)/);
            if (matchDebug) {
                this.stats.tps = matchDebug[1];
                // Broadcast updated status with accurate TPS
                this.broadcast({
                    type: 'status',
                    online: this.serverStatus === 'online',
                    stats: this.stats,
                    startTime: this.startTime
                });
            }
        }
    });
    this.stats.players = this.players.length;
    if (this.startTime) {
        const uptime = Date.now() - this.startTime;
        this.stats.uptime = this.formatUptime(uptime);
    }
};

module.exports.updatePlayersList = function() {
    this.broadcast({ type: 'players', players: this.players });
};

module.exports.formatUptime = function(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours   = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
    const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
};