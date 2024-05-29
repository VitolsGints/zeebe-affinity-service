/* eslint-disable @typescript-eslint/no-var-requires */
// Import the ZBAffinityServer class from the local module (or zeebe-node-affinity package)
const { ZBAffinityServer } = require("../dst"); // require("zeebe-node-affinity");

// Define the port on which the affinity server will listen
const zbsPort = 8089;

// Create an instance of the ZBAffinityServer with DEBUG log level
const zbs = new ZBAffinityServer({ logLevel: "DEBUG" });

// Start the server and listen on the specified port
zbs.listen(zbsPort, () =>
  console.log(`Zeebe Affinity Server listening on port ${zbsPort}`)
);

// Set up an interval to output server statistics every 12 seconds (1000 ms * 60 * 0.2 = 12000 ms)
setInterval(() => zbs.outputStats(), 1000 * 60 * 0.2);
