const express = require('express');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const https = require('https');
const { pipeline } = require('stream');
const { promisify } = require('util');

const MinecraftServer = require('./server/minecraft-server.js');

// Start the server
new MinecraftServer();