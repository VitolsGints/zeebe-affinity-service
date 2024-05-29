"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZBAffinityServer = void 0;
const dayjs_1 = __importDefault(require("dayjs")); // Importing dayjs library for time manipulation
const ws_1 = __importDefault(require("ws")); // Importing WebSocket library for WebSocket communication
const WebSocketAPI_1 = require("./WebSocketAPI"); // Importing message types and functions from WebSocketAPI module
// Function to update heartbeat status
function heartbeat() {
    this.isAlive = true; // Mark the connection as alive when pong is received
}
// Class definition for ZBAffinityServer
class ZBAffinityServer {
    // Constructor for initializing ZBAffinityServer
    constructor(options) {
        this.workers = {}; // Object to store worker connections
        this.clients = {}; // Object to store client connections
        this.connections = {}; // Object to store all connections
        this.options = options || {}; // Set options or use default values
        if (this.options.statsInterval) {
            // Set interval to output server stats if provided in options
            setInterval(() => this.outputStats(), this.options.statsInterval);
        }
        this.logLevel = this.options.logLevel || 'INFO'; // Set log level or use default
    }
    // Method to start listening on a port
    listen(port, cb) {
        // Create WebSocket server instance
        this.wss = new ws_1.default.Server({
            port,
            perMessageDeflate: false, // Disable per-message deflate for simplicity
        });
        // Set interval to remove dead connections
        this.removeDeadConnections = setInterval(() => {
            this.debug('Reaping dead connections');
            // Function to handle dead connections
            const reaper = (ws) => {
                this.debug({
                    ws: {
                        isAlive: ws.isAlive,
                        isClient: ws.isClient,
                        isWorker: ws.isWorker,
                    },
                });
                if (ws.isAlive === false) {
                    // Remove dead connections from respective collections
                    if (ws.isClient) {
                        delete this.clients[ws.uuid];
                    }
                    if (ws.isWorker) {
                        delete this.workers[ws.uuid];
                    }
                    delete this.connections[ws.uuid];
                    return ws.terminate(); // Terminate dead connection
                }
                ws.isAlive = false; // Mark connection as dead
                ws.ping(); // Send ping to check connection status
            };
            // Iterate over all connections and perform reaping
            Object.values(this.connections).forEach(reaper);
        }, 30000); // Set timeout for removing dead connections
        // Handle new WebSocket connections
        this.wss.on('connection', (w) => {
            const ws = w; // Cast to WebSocketWithAlive for additional properties
            ws.isAlive = true; // Mark connection as alive
            ws.on('pong', heartbeat); // Listen for pong messages for heartbeat
            ws.ping(); // Send ping to check connection status
            ws.on('message', (message) => {
                const msg = JSON.parse(message.toString());
                switch (msg.type) {
                    case WebSocketAPI_1.AffinityAPIMessageType.REGISTER_CLIENT:
                        ws.isClient = true; // Mark connection as a client
                        const clientId = ws.uuid; // Generate or get UUID for client connection
                        ws.uuid = clientId; // Assign UUID to connection
                        this.clients[clientId] = ws; // Add connection to client collection
                        this.connections[clientId] = ws; // Add connection to all connections collection
                        this.debug('New client connected'); // Log new client connection
                        break;
                    case WebSocketAPI_1.AffinityAPIMessageType.REGISTER_WORKER:
                        ws.isWorker = true; // Mark connection as a worker
                        const workerId = ws.uuid; // Generate or get UUID for worker connection
                        ws.uuid = workerId; // Assign UUID to connection
                        this.workers[workerId] = ws; // Add connection to worker collection
                        this.connections[workerId] = ws; // Add connection to all connections collection
                        this.debug('New worker connected'); // Log new worker connection
                        break;
                    case WebSocketAPI_1.AffinityAPIMessageType.PROCESS_OUTCOME:
                        (0, WebSocketAPI_1.broadcastProcessOutcome)(this.clients, msg); // Broadcast process outcome to clients
                        break;
                }
            });
        });
        if (cb) {
            cb(); // Callback after server starts listening
        }
    }
    // Method to gather server statistics
    stats() {
        // Logic to gather server statistics
        return {
            time: (0, dayjs_1.default)().format('{YYYY} MM-DDTHH:mm:ss SSS [Z] A'),
            workerCount: Object.keys(this.workers).length,
            clientCount: Object.keys(this.clients).length,
            cpu: process.cpuUsage(),
            memory: process.memoryUsage(), // Memory usage
        };
    }
    // Method to output server statistics
    outputStats() {
        const stats = this.stats(); // Get server statistics
        console.log(stats.time); // Log current time
        console.log(`Worker count: ${stats.workerCount}`); // Log worker count
        console.log(`Client count: ${stats.clientCount}`); // Log client count
        console.log(`CPU: ${stats.cpu}`); // Log CPU usage
        console.log(`Memory used: ${stats.memory}`); // Log memory usage
    }
    // Private method for logging messages
    log(...args) {
        console.log(args); // Log messages
    }
    // Private method for debugging messages
    debug(...args) {
        if (this.logLevel === 'DEBUG') {
            console.log(args); // Log debug messages if log level is DEBUG
        }
        return undefined;
    }
}
exports.ZBAffinityServer = ZBAffinityServer;
