const fs = require('fs');
const path = require('path');

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
        
        // Allow time for the WebSocket message to be sent before exiting
        setTimeout(() => {
            console.log('Restarting process...');
            process.exit(0); 
        }, 1000);

    } catch (error) {
        console.error('Update failed:', error);
        this.broadcast({ type: 'error', message: `Update failed: ${error.message}` });
    }
};

