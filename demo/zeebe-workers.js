/* eslint-disable @typescript-eslint/no-var-requires */
const { Camunda8 } = require('@camunda8/sdk'); // Import the Camunda 8 SDK

// Configuration options for the Camunda 8 client
const options = {
  ZEEBE_ADDRESS: 'localhost:26500', // Address of the Zeebe broker
  CAMUNDA_SECURE_CONNECTION: false, // Disable secure connection to Camunda
  CAMUNDA_OAUTH_DISABLED: true, // Disable OAuth for Camunda
};

// Instantiate the Camunda 8 client with the provided options
const c8 = new Camunda8(options);
// Get the Zeebe gRPC API client from the Camunda 8 client
const zbc = c8.getZeebeGrpcApiClient();

// Function to start Zeebe workers
async function startZeebeWorkers() {
  console.log(`startZeebeWorkers: STARTED`);
  // Create a task worker for the 'transform' task type
  const taskWorker = zbc.createWorker({
    taskType: 'transform', // Define the task type to listen for
    taskHandler: async (job) => {
      // Task worker business logic goes here
      const message = `Hello ${job.variables.name}!`; // Create a message using the job variables

      // Complete the job and return the message
      return job.complete({
        message: message
      });
    }
  });
}

// Start the Zeebe workers
startZeebeWorkers();
