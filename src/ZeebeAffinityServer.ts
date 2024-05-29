import dayjs from 'dayjs'; // Importing dayjs library for time manipulation
import WebSocket from 'ws'; // Importing WebSocket library for WebSocket communication
import {
    AffinityAPIMessageType, // Importing message types from WebSocketAPI
    broadcastProcessOutcome, // Importing function to broadcast process outcome to clients
    RegisterClientMessage, // Importing message type for registering client
    RegisterWorkerMessage, // Importing message type for registering worker
    ProcessOutcomeMessage, // Importing message type for process outcome
} from './WebSocketAPI'; // Importing message types and functions from WebSocketAPI module
import uuid = require('uuid'); // Importing uuid library for generating unique identifiers

// Interface for ZBAffinityServer options
interface ZBAffinityServerOptions {
    statsInterval?: number; // Interval for outputting server stats
    logLevel?: 'INFO' | 'DEBUG'; // Log level for debugging
}

// Interface for WebSocket with additional properties
interface WebSocketWithAlive extends WebSocket {
    isAlive: boolean; // Flag indicating if connection is alive
    uuid: string; // Unique identifier for connection
    isWorker: boolean; // Flag indicating if connection is a worker
    isClient: boolean; // Flag indicating if connection is a client
}

// Function to update heartbeat status
function heartbeat() {
    this.isAlive = true; // Mark the connection as alive when pong is received
}

// Class definition for ZBAffinityServer
export class ZBAffinityServer {
    workers: { [key: string]: WebSocketWithAlive } = {}; // Object to store worker connections
    clients: { [key: string]: WebSocketWithAlive } = {}; // Object to store client connections
    connections: { [key: string]: WebSocketWithAlive } = {}; // Object to store all connections
    wss!: WebSocket.Server; // WebSocket server instance
    options: ZBAffinityServerOptions; // Server options
    removeDeadConnections!: NodeJS.Timer; // Timer for removing dead connections
    logLevel: string; // Log level for debugging

    // Constructor for initializing ZBAffinityServer
    constructor(options?: ZBAffinityServerOptions) {
        this.options = options || {}; // Set options or use default values
        if (this.options.statsInterval) {
            // Set interval to output server stats if provided in options
            setInterval(() => this.outputStats(), this.options.statsInterval);
        }
        this.logLevel = this.options.logLevel || 'INFO'; // Set log level or use default
    }

    // Method to start listening on a port
    listen(port: number, cb?: () => void): void {
        // Create WebSocket server instance
        this.wss = new WebSocket.Server({
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
            const ws = w as WebSocketWithAlive; // Cast to WebSocketWithAlive for additional properties
            ws.isAlive = true; // Mark connection as alive
            ws.on('pong', heartbeat); // Listen for pong messages for heartbeat
            ws.ping(); // Send ping to check connection status
            ws.on('message', (message) => {
                const msg:
                    | RegisterClientMessage
                    | RegisterWorkerMessage
                    | ProcessOutcomeMessage = JSON.parse(message.toString());
                switch (msg.type) {
                    case AffinityAPIMessageType.REGISTER_CLIENT:
                        ws.isClient = true; // Mark connection as a client
                        const clientId = ws.uuid; // Generate or get UUID for client connection
                        ws.uuid = clientId; // Assign UUID to connection
                        this.clients[clientId] = ws; // Add connection to client collection
                        this.connections[clientId] = ws; // Add connection to all connections collection
                        this.debug('New client connected'); // Log new client connection
                        break;
                    case AffinityAPIMessageType.REGISTER_WORKER:
                        ws.isWorker = true; // Mark connection as a worker
                        const workerId = ws.uuid; // Generate or get UUID for worker connection
                        ws.uuid = workerId; // Assign UUID to connection
                        this.workers[workerId] = ws; // Add connection to worker collection
                        this.connections[workerId] = ws; // Add connection to all connections collection
                        this.debug('New worker connected'); // Log new worker connection
                        break;
                    case AffinityAPIMessageType.PROCESS_OUTCOME:
                        broadcastProcessOutcome(this.clients, msg); // Broadcast process outcome to clients
                        break;
                }
            });
        });
        if (cb) {
            cb(); // Callback after server starts listening
        }
    }

    // Method to gather server statistics
    stats(): Record<string, unknown> {
        // Logic to gather server statistics
        return {
            time: dayjs().format('{YYYY} MM-DDTHH:mm:ss SSS [Z] A'), // Current time
            workerCount: Object.keys(this.workers).length, // Number of workers
            clientCount: Object.keys(this.clients).length, // Number of clients
            cpu: process.cpuUsage(), // CPU usage
            memory: process.memoryUsage(), // Memory usage
        };
    }

    // Method to output server statistics
    outputStats(): void {
        const stats = this.stats(); // Get server statistics
        console.log(stats.time); // Log current time
        console.log(`Worker count: ${stats.workerCount}`); // Log worker count
        console.log(`Client count: ${stats.clientCount}`); // Log client count
        console.log(`CPU: ${stats.cpu}`); // Log CPU usage
        console.log(`Memory used: ${stats.memory}`); // Log memory usage
    }

    // Private method for logging messages
    private log(...args) {
        console.log(args); // Log messages
    }

    // Private method for debugging messages
    private debug(...args) {
        if (this.logLevel === 'DEBUG') {
            console.log(args); // Log debug messages if log level is DEBUG
        }
        return undefined;
    }
}
