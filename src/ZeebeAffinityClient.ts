/*
This TypeScript code defines a class ZBAffinityClient that acts as a client for interacting with the Zeebe Affinity service. 
It includes methods for creating affinity workers, creating process instances with affinity, 
and handling communication with the affinity service via WebSocket. 
Additionally, it imports necessary functions and types from the WebSocketAPI module and the Zeebe gRPC client, 
as well as utility types and libraries such as promiseRetry and WebSocket. 
The code also includes comments explaining the purpose of each function, property, and import statement.
*/

import promiseRetry from 'promise-retry'; // Import the promise retry library
import WebSocket from 'ws'; // Import the WebSocket library
import {
    demarshalProcessOutcome, // Function to convert raw message data to process outcome
    publishProcessOutcomeToAffinityService, // Function to send process outcome to affinity service
    registerClient, // Function to register a client with the affinity service
    registerWorker, // Function to register a worker with the affinity service
    ProcessOutcome, // Type definition for process outcome
} from './WebSocketAPI'; // Import functions and types from the WebSocketAPI module
import { ZeebeGrpcClient } from '@camunda8/sdk/dist/zeebe'; // Import Zeebe gRPC client
import { ZBClientOptions } from '@camunda8/sdk/dist/zeebe/lib/interfaces-published-contract'; // Import Zeebe client options type
import { JSONDoc } from '@camunda8/sdk/dist/zeebe/lib/interfaces-1.0'; // Import JSON document type

const AFFINITY_TIMEOUT_DEFAULT = 30000; // Default timeout for affinity service in milliseconds

// Utility type for deep partial object
export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// Function to filter and convert variables to suitable types for Zeebe
export function filterVariables(variables: { [key: string]: any }): { [key: string]: string | number } {
    const filteredVariables: { [key: string]: string | number } = {};
    for (const key in variables) {
        const value = variables[key];
        if (typeof value === 'string' || typeof value === 'number') {
            filteredVariables[key] = value; // Keep string and number types as is
        } else if (typeof value === 'boolean') {
            filteredVariables[key] = value.toString(); // Convert boolean to string
        } else if (value !== null && typeof value === 'object') {
            filteredVariables[key] = JSON.stringify(value); // Convert object to JSON string
        }
        // Add more type conversions if needed
    }
    return filteredVariables;
}

// Interface for ZBAffinityClient options, extending ZBClientOptions
interface ZBAffinityClientOptions extends ZBClientOptions {
    affinityServiceUrl: string; // URL of the affinity service
    affinityTimeout: number; // Timeout for the affinity service
    config?: DeepPartial<{
        zeebeGrpcSettings: {
            ZEEBE_CLIENT_LOG_LEVEL: string;
            ZEEBE_GRPC_CLIENT_EAGER_CONNECT: boolean;
            ZEEBE_GRPC_CLIENT_RETRY: boolean;
            ZEEBE_GRPC_CLIENT_MAX_RETRIES: number;
            ZEEBE_GRPC_WORKER_POLL_INTERVAL_MS: number;
        };
        CAMUNDA_CONSOLE_CLIENT_SECRET: string | undefined;
    }>;
}

// Class definition for ZBAffinityClient
export class ZBAffinityClient extends ZeebeGrpcClient {
    affinityServiceUrl: string; // URL of the affinity service
    affinityService!: WebSocket; // WebSocket instance for affinity service
    ws?: WebSocket; // Optional WebSocket instance
    affinityCallbacks: {
        [processInstanceKey: string]: (processOutcome: ProcessOutcome) => void; // Callbacks for process outcomes
    };
    affinityTimeout: number; // Timeout for the affinity service
    pingTimeout!: NodeJS.Timeout; // Timeout for ping

    // Constructor to initialize ZBAffinityClient
    constructor(options: ZBAffinityClientOptions) {
        super(options);
        if (!(options && options.affinityServiceUrl)) {
            throw new Error(
                'This ZBAffinityClient constructor options must have a URL for a Zeebe Affinity Server!',
            );
        }
        this.affinityServiceUrl = options.affinityServiceUrl;
        this.affinityTimeout = options.affinityTimeout || AFFINITY_TIMEOUT_DEFAULT;
        this.affinityCallbacks = {};
        this.createAffinityService(); // Create the affinity service connection
    }

    // Function to create an affinity worker for a specific task type
    async createAffinityWorker(taskType: string): Promise<void> {
        await this.waitForAffinity(); // Ensure affinity service is available
        registerWorker(this.affinityService); // Register the worker with the affinity service
        super.createWorker({
            taskType, // Task type for the worker
            taskHandler: async (job) => {
                if (this.affinityService.readyState !== WebSocket.OPEN) {
                    try {
                        await this.waitForAffinity(); // Wait for the affinity service to be ready
                    } catch (e) {
                        return job.fail(`Could not contact Affinity Server at ${this.affinityServiceUrl}`);
                    }
                }
                publishProcessOutcomeToAffinityService(
                    {
                        processInstanceKey: job.processInstanceKey, // Key of the process instance
                        variables: filterVariables(job.variables), // Filtered variables
                    },
                    this.affinityService, // Affinity service WebSocket
                );
                return job.complete(); // Complete the job
            },
        });
    }

    // Function to create a process instance with affinity
    async createProcessInstanceWithAffinity<Variables extends JSONDoc>({
        bpmnProcessId,
        variables,
        cb,
    }: {
        bpmnProcessId: string; // BPMN process ID
        variables: Variables; // Variables for the process instance
        version?: number; // Optional version of the process
        cb: (processOutcome: ProcessOutcome) => void; // Callback function for process outcome
    }): Promise<unknown> {
        await this.waitForAffinity(); // Ensure affinity service is available

        // Create the process instance using the Zeebe gRPC client
        const wfi = await super.createProcessInstance({ bpmnProcessId, variables });
        if (this.affinityService) {
            this.affinityCallbacks[wfi.processInstanceKey] = cb; // Register callback for application code
        }
        return wfi;
    }

    // Function to wait for the affinity service to be ready
    async waitForAffinity(): Promise<void> {
        if (!this.affinityService || this.affinityService.readyState !== WebSocket.OPEN) {
            const sleep = (waitTimeInMs) => new Promise((resolve) => setTimeout(resolve, waitTimeInMs));
            const timeoutFn = setTimeout(() => {
                this.throwNoConnection(); // Throw an error if connection times out
            }, this.affinityTimeout);
            while (!this.affinityService || this.affinityService.readyState !== WebSocket.OPEN) {
                await sleep(200); // Wait for 200ms before retrying
            }
            clearTimeout(timeoutFn); // Clear the timeout if connection is established
        }
    }

    // Function to throw an error if connection to affinity service times out
    private throwNoConnection() {
        throw new Error(
            `This ZBAffinityClient timed out establishing a connection to the Zeebe Affinity Server at ${this.affinityServiceUrl}!`,
        );
    }

    // Function to create the affinity service connection
    private async createAffinityService() {
        if (!this.affinityServiceUrl) {
            return;
        }
        console.log('Creating affinity connection');
        const setUpConnection = this.setUpConnection.bind(this); // Bind the setup connection function
        await promiseRetry((retry) =>
            new Promise((resolve, reject) => {
                try {
                    this.affinityService = new WebSocket(this.affinityServiceUrl, {
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
                } catch (error: unknown) {
                    if (error instanceof Error) {
                        console.log(error.message);
                        reject(error);
                    } else {
                        throw error;
                    }
                }
            }).catch(retry),
        );
    }

    // Function to handle heartbeat and maintain connection
    private heartbeat(): void {
        clearTimeout(this.pingTimeout);

        this.pingTimeout = setTimeout(() => {
            this.affinityService.terminate(); // Terminate the connection
            this.affinityService = undefined as unknown as WebSocket;
            this.createAffinityService(); // Recreate the affinity service connection
        }, 30000 + 1000); // Timeout for ping
    }

    // Function to setup the WebSocket connection
    private setUpConnection() {
        registerClient(this.affinityService); // Register the client with the affinity service
        console.log(`Connected to Zeebe Affinity Service at ${this.affinityServiceUrl}`);
        this.heartbeat(); // Start the heartbeat

        this.affinityService.on('ping', this.heartbeat.bind(this)); // Handle ping events
        this.affinityService.on('message', this.handleMessage.bind(this)); // Handle message events
    }

    // Function to handle incoming messages from the affinity service
    private handleMessage(data) {
        const outcome = demarshalProcessOutcome(data); // Convert raw message data to process outcome
        if (outcome) {
            const wfi = outcome.processInstanceKey; // Process instance key
            if (this.affinityCallbacks[wfi]) {
                this.affinityCallbacks[wfi](outcome); // Execute the callback with the process outcome
                this.affinityCallbacks[wfi] = undefined as never; // Remove the callback to prevent memory leaks
            }
        }
    }
}
