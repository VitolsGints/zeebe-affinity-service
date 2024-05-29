/*
Definition of Key Parts:
Configuration (options): Specifies the connection details for the Zeebe broker and the affinity service.
ZBAffinityClient: Creates a client instance for interacting with Zeebe using affinity.
createAffinityWorker: Sets up an affinity worker for the specified task type ("publish-outcome"), which is intended to be placed at the end of a workflow to handle the publishing of outcomes.
This code demonstrates how to configure and start an affinity worker with the Zeebe Node client, specifically designed to publish outcomes at the end of workflows.
*/

/* eslint-disable @typescript-eslint/no-var-requires */
const { ZBAffinityClient } = require("../dst"); // Import the ZBAffinityClient from the specified directory

// Configuration options for the ZBAffinityClient
const options = {
  affinityServiceUrl: 'ws://localhost:8089', // URL of the affinity service
  affinityTimeout: 6000, // Timeout for the affinity service in milliseconds
  config: {
    ZEEBE_ADDRESS: 'localhost:26500', // Address of the Zeebe broker
    CAMUNDA_SECURE_CONNECTION: false, // Disable secure connection to Camunda
    CAMUNDA_OAUTH_DISABLED: true, // Disable OAuth for Camunda
  }
};

// Create an instance of ZBAffinityClient with the provided options
const zbc = new ZBAffinityClient(options);

// Create an affinity worker for the task type "publish-outcome"
// This worker can be used at the end of a workflow to publish the outcome
zbc.createAffinityWorker("publish-outcome");
