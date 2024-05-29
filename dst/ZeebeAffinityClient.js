"use strict";
/*
This TypeScript code defines a class ZBAffinityClient that acts as a client for interacting with the Zeebe Affinity service.
It includes methods for creating affinity workers, creating process instances with affinity,
and handling communication with the affinity service via WebSocket.
Additionally, it imports necessary functions and types from the WebSocketAPI module and the Zeebe gRPC client,
as well as utility types and libraries such as promiseRetry and WebSocket.
The code also includes comments explaining the purpose of each function, property, and import statement.
*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZBAffinityClient = exports.filterVariables = void 0;
const promise_retry_1 = __importDefault(require("promise-retry")); // Import the promise retry library
const ws_1 = __importDefault(require("ws")); // Import the WebSocket library
const WebSocketAPI_1 = require("./WebSocketAPI"); // Import functions and types from the WebSocketAPI module
const zeebe_1 = require("@camunda8/sdk/dist/zeebe"); // Import Zeebe gRPC client
const AFFINITY_TIMEOUT_DEFAULT = 30000; // Default timeout for affinity service in milliseconds
// Function to filter and convert variables to suitable types for Zeebe
function filterVariables(variables) {
    const filteredVariables = {};
    for (const key in variables) {
        const value = variables[key];
        if (typeof value === 'string' || typeof value === 'number') {
            filteredVariables[key] = value; // Keep string and number types as is
        }
        else if (typeof value === 'boolean') {
            filteredVariables[key] = value.toString(); // Convert boolean to string
        }
        else if (value !== null && typeof value === 'object') {
            filteredVariables[key] = JSON.stringify(value); // Convert object to JSON string
        }
        // Add more type conversions if needed
    }
    return filteredVariables;
}
exports.filterVariables = filterVariables;
// Class definition for ZBAffinityClient
class ZBAffinityClient extends zeebe_1.ZeebeGrpcClient {
    // Constructor to initialize ZBAffinityClient
    constructor(options) {
        super(options);
        if (!(options && options.affinityServiceUrl)) {
            throw new Error('This ZBAffinityClient constructor options must have a URL for a Zeebe Affinity Server!');
        }
        this.affinityServiceUrl = options.affinityServiceUrl;
        this.affinityTimeout = options.affinityTimeout || AFFINITY_TIMEOUT_DEFAULT;
        this.affinityCallbacks = {};
        this.createAffinityService(); // Create the affinity service connection
    }
    // Function to create an affinity worker for a specific task type
    async createAffinityWorker(taskType) {
        await this.waitForAffinity(); // Ensure affinity service is available
        (0, WebSocketAPI_1.registerWorker)(this.affinityService); // Register the worker with the affinity service
        super.createWorker({
            taskType,
            taskHandler: async (job) => {
                if (this.affinityService.readyState !== ws_1.default.OPEN) {
                    try {
                        await this.waitForAffinity(); // Wait for the affinity service to be ready
                    }
                    catch (e) {
                        return job.fail(`Could not contact Affinity Server at ${this.affinityServiceUrl}`);
                    }
                }
                (0, WebSocketAPI_1.publishProcessOutcomeToAffinityService)({
                    processInstanceKey: job.processInstanceKey,
                    variables: filterVariables(job.variables), // Filtered variables
                }, this.affinityService);
                return job.complete(); // Complete the job
            },
        });
    }
    // Function to create a process instance with affinity
    async createProcessInstanceWithAffinity({ bpmnProcessId, variables, cb, }) {
        await this.waitForAffinity(); // Ensure affinity service is available
        // Create the process instance using the Zeebe gRPC client
        const wfi = await super.createProcessInstance({ bpmnProcessId, variables });
        if (this.affinityService) {
            this.affinityCallbacks[wfi.processInstanceKey] = cb; // Register callback for application code
        }
        return wfi;
    }
    // Function to wait for the affinity service to be ready
    async waitForAffinity() {
        if (!this.affinityService || this.affinityService.readyState !== ws_1.default.OPEN) {
            const sleep = (waitTimeInMs) => new Promise((resolve) => setTimeout(resolve, waitTimeInMs));
            const timeoutFn = setTimeout(() => {
                this.throwNoConnection(); // Throw an error if connection times out
            }, this.affinityTimeout);
            while (!this.affinityService || this.affinityService.readyState !== ws_1.default.OPEN) {
                await sleep(200); // Wait for 200ms before retrying
            }
            clearTimeout(timeoutFn); // Clear the timeout if connection is established
        }
    }
    // Function to throw an error if connection to affinity service times out
    throwNoConnection() {
        throw new Error(`This ZBAffinityClient timed out establishing a connection to the Zeebe Affinity Server at ${this.affinityServiceUrl}!`);
    }
    // Function to create the affinity service connection
    async createAffinityService() {
        if (!this.affinityServiceUrl) {
            return;
        }
        console.log('Creating affinity connection');
        const setUpConnection = this.setUpConnection.bind(this); // Bind the setup connection function
        await (0, promise_retry_1.default)((retry) => new Promise((resolve, reject) => {
            try {
                this.affinityService = new ws_1.default(this.affinityServiceUrl, {
                    perMessageDeflate: false, // Disable per-message deflate
                });
                this.affinityService.on('error', (err) => {
                    console.log('ERROR', err);
                    reject();
                });
                this.affinityService.on('open', () => {
                    setUpConnection(); // Setup the connection when WebSocket is open
                    resolve(null);
                });
            }
            catch (error) {
                if (error instanceof Error) {
                    console.log(error.message);
                    reject(error);
                }
                else {
                    throw error;
                }
            }
        }).catch(retry));
    }
    // Function to handle heartbeat and maintain connection
    heartbeat() {
        clearTimeout(this.pingTimeout);
        this.pingTimeout = setTimeout(() => {
            this.affinityService.terminate(); // Terminate the connection
            this.affinityService = undefined;
            this.createAffinityService(); // Recreate the affinity service connection
        }, 30000 + 1000); // Timeout for ping
    }
    // Function to setup the WebSocket connection
    setUpConnection() {
        (0, WebSocketAPI_1.registerClient)(this.affinityService); // Register the client with the affinity service
        console.log(`Connected to Zeebe Affinity Service at ${this.affinityServiceUrl}`);
        this.heartbeat(); // Start the heartbeat
        this.affinityService.on('ping', this.heartbeat.bind(this)); // Handle ping events
        this.affinityService.on('message', this.handleMessage.bind(this)); // Handle message events
    }
    // Function to handle incoming messages from the affinity service
    handleMessage(data) {
        const outcome = (0, WebSocketAPI_1.demarshalProcessOutcome)(data); // Convert raw message data to process outcome
        if (outcome) {
            const wfi = outcome.processInstanceKey; // Process instance key
            if (this.affinityCallbacks[wfi]) {
                this.affinityCallbacks[wfi](outcome); // Execute the callback with the process outcome
                this.affinityCallbacks[wfi] = undefined; // Remove the callback to prevent memory leaks
            }
        }
    }
}
exports.ZBAffinityClient = ZBAffinityClient;
