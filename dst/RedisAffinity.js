"use strict";
/*
This code defines a RedisAffinity class that integrates Redis with a Zeebe client to manage task processing and messaging.
The class uses Redis to handle asynchronous communication for process outcomes in Zeebe workflows.
*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisAffinity = void 0;
/* eslint-disable no-unused-vars */
const redis_1 = __importDefault(require("redis")); // Import Redis client and types
const zeebe_1 = require("@camunda8/sdk/dist/zeebe"); // Import Zeebe gRPC client from Camunda SDK
const ZeebeAffinityClient_1 = require("./ZeebeAffinityClient"); // Import filterVariables function from ZeebeAffinityClient
const typed_duration_1 = require("typed-duration"); // Import Duration for time-to-live settings
// TODO: handle errors if missing parameters (example: process instance key)
// TODO: purge the service
// RedisAffinity class extends ZeebeGrpcClient for Zeebe and Redis integration
class RedisAffinity extends zeebe_1.ZeebeGrpcClient {
    // Constructor initializes Redis clients and sets up event handlers
    constructor(gatewayAddress, redisOptions) {
        super(gatewayAddress);
        this.subscriber = redis_1.default.createClient(redisOptions); // Initialize Redis subscriber
        this.publisher = redis_1.default.createClient(redisOptions); // Initialize Redis publisher
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
        this.subscriber.on('message', (channel, message) => {
            console.log(`subscriber received message in channel ${channel}`);
            try {
                this.affinityCallbacks[channel](JSON.parse(message)); // Call registered callback
            }
            catch (err) {
                console.error(err);
            }
        });
    }
    // Method to create a Zeebe worker with affinity
    async createAffinityWorker(taskType) {
        super.createWorker({
            taskType,
            taskHandler: async (job) => {
                try {
                    console.log(`Publish message on channel: ${job.processInstanceKey}`);
                    const updatedVars = {
                        ...job?.variables,
                        processInstanceKey: job?.processInstanceKey,
                    };
                    this.publisher.publish(job.processInstanceKey, JSON.stringify(updatedVars));
                    return await job.complete(updatedVars);
                }
                catch (error) {
                    if (error instanceof Error) {
                        console.error(`Error while publishing message on channel: ${job.processInstanceKey}`);
                        return job.fail(error.message);
                    }
                    else {
                        throw error;
                    }
                }
            },
        });
    }
    // Method to create a Zeebe process instance with affinity
    async createProcessInstanceWithAffinity({ bpmnProcessId, variables, cb, }) {
        try {
            const wfi = await super.createProcessInstance({
                bpmnProcessId,
                variables,
            });
            this.affinityCallbacks[wfi.processInstanceKey] = cb; // Register callback
            this.subscriber.subscribe(wfi.processInstanceKey, () => {
                console.log(`Subscribe to channel ${wfi.processInstanceKey}`);
            });
        }
        catch (err) {
            console.error(err);
            throw err;
        }
    }
    // Method to publish a message with affinity
    async publishMessageWithAffinity({ correlationKey, messageId, name, variables, processInstanceKey, cb, }) {
        await super.publishMessage({
            correlationKey,
            messageId,
            name,
            variables: (0, ZeebeAffinityClient_1.filterVariables)(variables),
            timeToLive: typed_duration_1.Duration.seconds.of(10),
        });
        this.affinityCallbacks[processInstanceKey] = cb;
        this.subscriber.subscribe(processInstanceKey, () => {
            console.log(`Subscribe to channel ${processInstanceKey}`);
        });
    }
    // Method to clean up subscriptions and callbacks
    cleanup(channel) {
        console.log(`Unsubscribe from channel ${channel} and removing affinity callbacks.`);
        this.subscriber.unsubscribe(channel);
        try {
            delete this.affinityCallbacks[channel];
        }
        catch (err) {
            console.error(err);
        }
    }
}
exports.RedisAffinity = RedisAffinity;
