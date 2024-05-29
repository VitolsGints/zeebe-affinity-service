/* eslint-disable promise/catch-or-return */
/* eslint-disable @typescript-eslint/no-var-requires */
const { ZBAffinityClient } = require("../dst"); // Import the ZBAffinityClient from the specified directory

// Configuration options for the ZBAffinityClient
const options = {
  affinityServiceUrl: 'ws://localhost:8089', // URL of the affinity service
  affinityTimeout: 6000, // Timeout for affinity service in milliseconds
  config: {
    ZEEBE_ADDRESS: 'localhost:26500', // Address of the Zeebe broker
    CAMUNDA_SECURE_CONNECTION: false, // Disable secure connection to Camunda
    CAMUNDA_OAUTH_DISABLED: true, // Disable OAuth for Camunda
  }
};

// Create an instance of ZBAffinityClient with the provided options
const zbc = new ZBAffinityClient(options);

/* Emulated REST Client that requests a route to trigger a workflow and receives the outcome in the response */
function emulateRESTClient() {
  console.log(`\nREST Client:`);
  // Make 50 requests to simulate multiple clients
  for (let i = 0; i < 50; i++) {
    const req = { route: "/affinity-test", params: { name: `John${i}` } }; // Each request has a unique name parameter
    const responseHandler = res => console.log("Received response from server:", res); // Handle the server response
    setTimeout(() => {
      console.log(`Posting`, req);
      httpGET(req, responseHandler); // Simulate a GET request to the server
    }, i * 200); // Delay each request by 200ms
  }
}

/* ^^^ REST Client ^^^ */
/* Here is the REST boundary. We will return a workflow outcome to emulateRESTClient in a req-res */
/* vvv REST Server vvv */

/* Emulated REST Middleware to handle HTTP GET requests */
function httpGET(req, clientResponseHandler) {
  const res = {
    send: clientResponseHandler // Set up a response handler to send back to the client
  };
  const routedRequest = { ...req, route: req.route.split("/")[1] }; // Remove the leading slash from the route
  console.log('Sent request to server:', routedRequest);
  serverRESTHandler(routedRequest, res); // Pass the request to the server's route handler
}

/* Route handler to process requests and communicate with the Zeebe broker */
async function serverRESTHandler(req, res) {
  try {
    const bpmnProcessId = req.route; // Extract BPMN process ID from the route
    const variables = req.params; // Extract variables from the request parameters
    const response = await zbc.createProcessInstanceWithAffinity({
      bpmnProcessId: bpmnProcessId, // Set the BPMN process ID
      variables: variables, // Set the variables for the process instance
      cb: (processOutcome) => {
        console.log('Received variables from server:', JSON.stringify(processOutcome.variables));
        res.send(response); // Send the entire process outcome back to the client
      }
    });
  } catch (error) {
    console.error('Error in serverRESTHandler:', error);
    res.send(error); // Send error details back to the client
  }
}

/* Deploy the BPMN workflow to the Zeebe broker */
async function deployWorkflow() {
  const bpmnFilePath = "../demo/affinity-test.bpmn"; // Path to the BPMN file
  const wf = await zbc.deployResource({ processFilename: bpmnFilePath }); // Deploy the BPMN file
  console.log(`VF => ${JSON.stringify(wf)}`); // Log the deployment result
}

// Deploy the workflow and then start the emulated REST client
deployWorkflow().then(emulateRESTClient).catch((error) => {
  console.error('Error in deployWorkflow:', error); // Log any errors during deployment
});
