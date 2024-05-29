/*
This code defines functions and interfaces for communicating with the Zeebe Affinity API via WebSocket messages. 
It includes message types for process outcomes, client registration, and worker registration. 
The functions handle sending and receiving messages to/from the Affinity service and processing process outcome data.
*/

import WebSocket, { Data } from 'ws'; // Import WebSocket and Data types

// Enum defining different types of messages for the Affinity API
export enum AffinityAPIMessageType {
    PROCESS_OUTCOME = 'PROCESS_OUTCOME',
    REGISTER_WORKER = 'REGISTER_WORKER',
    REGISTER_CLIENT = 'REGISTER_CLIENT',
}

// Interface for a message containing process outcome data
export interface ProcessOutcomeMessage {
    type: AffinityAPIMessageType.PROCESS_OUTCOME; // Message type
    processInstanceKey: string; // Unique key for the process instance
    variables: { [key: string]: string | number }; // Variables associated with the process outcome
}

// Interface for a message requesting client registration
export interface RegisterClientMessage {
    type: AffinityAPIMessageType.REGISTER_CLIENT; // Message type
}

// Interface for a message requesting worker registration
export interface RegisterWorkerMessage {
    type: AffinityAPIMessageType.REGISTER_WORKER; // Message type
}

// Interface for a process outcome containing process instance key and variables
export interface ProcessOutcome {
    processInstanceKey: string; // Unique key for the process instance
    variables: { [key: string]: string | number }; // Variables associated with the process outcome
}

// Function to register a worker with the Affinity service
export function registerWorker(ws: WebSocket): void {
    ws.send(JSON.stringify({ type: AffinityAPIMessageType.REGISTER_WORKER })); // Send registration message to WebSocket
    return;
}

// Function to register a client with the Affinity service
export function registerClient(ws: WebSocket): void {
    ws.send(JSON.stringify({ type: AffinityAPIMessageType.REGISTER_CLIENT })); // Send registration message to WebSocket
    return;
}

// Function to broadcast process outcome to all registered clients
export function broadcastProcessOutcome(
    clients: { [uuid: string]: WebSocket }, // Map of client WebSocket connections
    processOutcome: ProcessOutcome, // Process outcome data
): void {
    const message: ProcessOutcomeMessage = { // Construct message containing process outcome data
        type: AffinityAPIMessageType.PROCESS_OUTCOME,
        ...processOutcome,
    };
    Object.values(clients).forEach((client) => { // Iterate through all registered clients
        if (client.readyState === WebSocket.OPEN) { // Check if client connection is open
            client.send(JSON.stringify(message)); // Send process outcome message to client
        }
    });
    return;
}

// Function to parse process outcome data from WebSocket data
export function demarshalProcessOutcome(data: Data): ProcessOutcome | undefined {
    const message = JSON.parse(data.toString()); // Parse WebSocket data to JSON
    return (message.type = AffinityAPIMessageType.PROCESS_OUTCOME // Check if message type is process outcome
        ? { ...message, type: undefined } // Return process outcome data without message type
        : undefined); // Return undefined if message type is not process outcome
}

// Function to publish process outcome to the Affinity service
export function publishProcessOutcomeToAffinityService(
    processOutcome: ProcessOutcome, // Process outcome data to be published
    ws: WebSocket, // WebSocket connection to the Affinity service
): void {
    const processOutcomeMessage: ProcessOutcomeMessage = { // Construct message containing process outcome data
        type: AffinityAPIMessageType.PROCESS_OUTCOME,
        ...processOutcome,
    };
    ws.send(JSON.stringify(processOutcomeMessage)); // Send process outcome message to Affinity service
}
