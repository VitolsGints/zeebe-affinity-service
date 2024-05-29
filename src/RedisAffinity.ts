/*
This code defines a RedisAffinity class that integrates Redis with a Zeebe client to manage task processing and messaging. 
The class uses Redis to handle asynchronous communication for process outcomes in Zeebe workflows.
*/

/* eslint-disable no-unused-vars */
import redis, { ClientOpts, RedisClient } from 'redis'; // Import Redis client and types
import { ProcessOutcome } from './WebSocketAPI'; // Import ProcessOutcome type from WebSocketAPI
import { ZeebeGrpcClient } from '@camunda8/sdk/dist/zeebe'; // Import Zeebe gRPC client from Camunda SDK
import { JSONDoc } from '@camunda8/sdk/dist/zeebe/lib/interfaces-1.0'; // Import JSONDoc type from Camunda SDK
import { filterVariables } from './ZeebeAffinityClient'; // Import filterVariables function from ZeebeAffinityClient
import { Duration } from 'typed-duration'; // Import Duration for time-to-live settings
import { DeepPartial } from './ZeebeAffinityClient'; // Import DeepPartial type from ZeebeAffinityClient

// TODO: handle errors if missing parameters (example: process instance key)
// TODO: purge the service

// RedisAffinity class extends ZeebeGrpcClient for Zeebe and Redis integration
export class RedisAffinity extends ZeebeGrpcClient {
    public subscriber: RedisClient; // Redis client for subscribing to channels
    publisher: RedisClient; // Redis client for publishing messages
    affinityCallbacks: {
        [processInstanceKey: string]: (processOutcome: ProcessOutcome) => void; // Callbacks for process outcomes
    };

    // Constructor initializes Redis clients and sets up event handlers
    constructor(gatewayAddress: {
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
    }, redisOptions: ClientOpts) {
        super(gatewayAddress);

        this.subscriber = redis.createClient(redisOptions); // Initialize Redis subscriber
        this.publisher = redis.createClient(redisOptions); // Initialize Redis publisher
        this.affinityCallbacks = {}; // Initialize callbacks map

        // Event handlers for Redis clients
        this.subscriber.on('connected', () => {
            console.log('Subscriber connected');
        });
        this.publisher.on('connected', () => {
            console.log('Publisher connected');
        });
        this.subscriber.on('error', (error) => {
            console.error(error);
        });
        this.publisher.on('error', (error) => {
            console.error(error);
        });

        // Handle messages received on subscribed channels
        this.subscriber.on('message', (channel: string, message: string) => {
            console.log(`subscriber received message in channel ${channel}`);
            try {
                this.affinityCallbacks[channel](JSON.parse(message)); // Call registered callback
            } catch (err) {
                console.error(err);
            }
        });
    }

    // Method to create a Zeebe worker with affinity
    async createAffinityWorker(taskType: string): Promise<void> {
        super.createWorker({
            taskType,
            taskHandler: async (job) => {
                try {
                    console.log(`Publish message on channel: ${job.processInstanceKey}`);
                    const updatedVars = {
                        ...job?.variables,
                        processInstanceKey: job?.processInstanceKey,
                    };
                    this.publisher.publish(
                        job.processInstanceKey,
                        JSON.stringify(updatedVars),
                    );
                    return await job.complete(updatedVars);
                } catch (error: unknown) {
                    if (error instanceof Error) {
                        console.error(`Error while publishing message on channel: ${job.processInstanceKey}`);
                        return job.fail(error.message);
                    } else {
                        throw error;
                    }
                }
            },
        });
    }

    // Method to create a Zeebe process instance with affinity
    async createProcessInstanceWithAffinity<Variables extends JSONDoc>({
        bpmnProcessId,
        variables,
        cb,
    }: {
        bpmnProcessId: string;
        variables: Variables;
        cb: (processOutcome: ProcessOutcome) => void;
    }): Promise<void> {
        try {
            const wfi = await super.createProcessInstance({
                bpmnProcessId,
                variables,
            });

            this.affinityCallbacks[wfi.processInstanceKey] = cb; // Register callback

            this.subscriber.subscribe(wfi.processInstanceKey, () => {
                console.log(`Subscribe to channel ${wfi.processInstanceKey}`);
            });
        } catch (err) {
            console.error(err);
            throw err;
        }
    }

    // Method to publish a message with affinity
    async publishMessageWithAffinity<Variables extends JSONDoc>({
        correlationKey,
        messageId,
        name,
        variables,
        processInstanceKey,
        cb,
    }: {
        correlationKey: string;
        messageId: string;
        name: string;
        variables: Variables;
        processInstanceKey: string;
        cb: (processOutcome: ProcessOutcome) => void;
    }): Promise<void> {
        await super.publishMessage({
            correlationKey,
            messageId,
            name,
            variables: filterVariables(variables),
            timeToLive: Duration.seconds.of(10),
        });

        this.affinityCallbacks[processInstanceKey] = cb;

        this.subscriber.subscribe(processInstanceKey, () => {
            console.log(`Subscribe to channel ${processInstanceKey}`);
        });
    }

    // Method to clean up subscriptions and callbacks
    cleanup(channel: string): void {
        console.log(`Unsubscribe from channel ${channel} and removing affinity callbacks.`);
        this.subscriber.unsubscribe(channel);
        try {
            delete this.affinityCallbacks[channel];
        } catch (err) {
            console.error(err);
        }
    }
}
