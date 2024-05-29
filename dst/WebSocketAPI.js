"use strict";
/*
This code defines functions and interfaces for communicating with the Zeebe Affinity API via WebSocket messages.
It includes message types for process outcomes, client registration, and worker registration.
The functions handle sending and receiving messages to/from the Affinity service and processing process outcome data.
*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishProcessOutcomeToAffinityService = exports.demarshalProcessOutcome = exports.broadcastProcessOutcome = exports.registerClient = exports.registerWorker = exports.AffinityAPIMessageType = void 0;
const ws_1 = __importDefault(require("ws")); // Import WebSocket and Data types
// Enum defining different types of messages for the Affinity API
var AffinityAPIMessageType;
(function (AffinityAPIMessageType) {
    AffinityAPIMessageType["PROCESS_OUTCOME"] = "PROCESS_OUTCOME";
    AffinityAPIMessageType["REGISTER_WORKER"] = "REGISTER_WORKER";
    AffinityAPIMessageType["REGISTER_CLIENT"] = "REGISTER_CLIENT";
})(AffinityAPIMessageType = exports.AffinityAPIMessageType || (exports.AffinityAPIMessageType = {}));
// Function to register a worker with the Affinity service
function registerWorker(ws) {
    ws.send(JSON.stringify({ type: AffinityAPIMessageType.REGISTER_WORKER })); // Send registration message to WebSocket
    return;
}
exports.registerWorker = registerWorker;
// Function to register a client with the Affinity service
function registerClient(ws) {
    ws.send(JSON.stringify({ type: AffinityAPIMessageType.REGISTER_CLIENT })); // Send registration message to WebSocket
    return;
}
exports.registerClient = registerClient;
// Function to broadcast process outcome to all registered clients
function broadcastProcessOutcome(clients, // Map of client WebSocket connections
processOutcome) {
    const message = {
        type: AffinityAPIMessageType.PROCESS_OUTCOME,
        ...processOutcome,
    };
    Object.values(clients).forEach((client) => {
        if (client.readyState === ws_1.default.OPEN) { // Check if client connection is open
            client.send(JSON.stringify(message)); // Send process outcome message to client
        }
    });
    return;
}
exports.broadcastProcessOutcome = broadcastProcessOutcome;
// Function to parse process outcome data from WebSocket data
function demarshalProcessOutcome(data) {
    const message = JSON.parse(data.toString()); // Parse WebSocket data to JSON
    return (message.type = AffinityAPIMessageType.PROCESS_OUTCOME // Check if message type is process outcome
        ? { ...message, type: undefined } // Return process outcome data without message type
        : undefined); // Return undefined if message type is not process outcome
}
exports.demarshalProcessOutcome = demarshalProcessOutcome;
// Function to publish process outcome to the Affinity service
function publishProcessOutcomeToAffinityService(processOutcome, // Process outcome data to be published
ws) {
    const processOutcomeMessage = {
        type: AffinityAPIMessageType.PROCESS_OUTCOME,
        ...processOutcome,
    };
    ws.send(JSON.stringify(processOutcomeMessage)); // Send process outcome message to Affinity service
}
exports.publishProcessOutcomeToAffinityService = publishProcessOutcomeToAffinityService;
