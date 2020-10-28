import promiseRetry from "promise-retry";
import { v4 as uuid } from "uuid";
import WebSocket from "ws";
import { ZBClient } from "zeebe-node";
import { KeyedObject } from "zeebe-node/dist/lib/interfaces";
import { ZBClientOptions } from 'zeebe-node/dist/lib/interfaces-published-contract';
import {
  demarshalWorkflowOutcome,
  publishWorkflowOutcomeToAffinityService,
  registerClient,
  registerWorker,
  WorkflowOutcome
} from "./WebSocketAPI";

const AFFINITY_TIMEOUT_DEFAULT = 30000;

interface ZBAffinityClientOptions extends ZBClientOptions {
  affinityServiceUrl: string;
  affinityTimeout: number;
}
export class ZBAffinityClient extends ZBClient {
  affinityServiceUrl: string;
  affinityService!: WebSocket;
  ws: any;
  affinityCallbacks: {
    [workflowInstanceKey: string]: (workflowOutcome: WorkflowOutcome) => void;
  };
  affinityTimeout: number;
  pingTimeout!: NodeJS.Timer;

  constructor(gatewayAddress: string, options: ZBAffinityClientOptions) {
    super(gatewayAddress, options);
    if (!(options && options.affinityServiceUrl)) {
      throw new Error(
        "This ZBAffinityClient constructor options must have a url for a Zeebe Affinity Server!"
      );
    }
    this.affinityServiceUrl = options && options.affinityServiceUrl;
    this.affinityTimeout =
      (options && options.affinityTimeout) || AFFINITY_TIMEOUT_DEFAULT;
    this.affinityCallbacks = {};
    this.createAffinityService();
  }

  async createAffinityWorker(taskType: string) {
    await this.waitForAffinity();
    registerWorker(this.affinityService);
    super.createWorker(uuid(), taskType, async (job, complete) => {
      if (this.affinityService.readyState !== WebSocket.OPEN) {
        try {
          await this.waitForAffinity();
        } catch (e) {
          return complete.failure(
            `Could not contact Affinity Server at ${this.affinityServiceUrl}`
          );
        }
      }
      publishWorkflowOutcomeToAffinityService(
        {
          workflowInstanceKey: job.workflowInstanceKey,
          variables: job.variables
        },
        this.affinityService
      );
      complete.success();
    });
  }

  async createWorkflowInstanceWithAffinity<Variables = KeyedObject>({
    bpmnProcessId,
    variables,
    version,
    cb
  }: {
    bpmnProcessId: string;
    variables: Variables;
    version?: number;
    cb: (workflowOutcome: WorkflowOutcome) => void;
  }) {
    await this.waitForAffinity();

    // TODO check for error creating workflow to prevent registering callback?
    const wfi = await super.createWorkflowInstance(
      bpmnProcessId,
      variables
    );

    if (this.affinityService) {
      this.affinityCallbacks[wfi.workflowInstanceKey] = cb; // Register callback for application code
    }
    return wfi;
  }

  async waitForAffinity() {
    if (
      !this.affinityService ||
      this.affinityService.readyState !== WebSocket.OPEN
    ) {
      const sleep = waitTimeInMs =>
        new Promise(resolve => setTimeout(resolve, waitTimeInMs));
      const timeoutFn = setTimeout(() => {
        this.throwNoConnection();
      }, this.affinityTimeout);
      while (
        !this.affinityService ||
        this.affinityService.readyState !== WebSocket.OPEN
      ) {
        await sleep(200);
      }

      clearTimeout(timeoutFn);
    }
  }

  private throwNoConnection() {
    throw new Error(
      `This ZBAffinityClient timed out establishing a connection to the Zeebe Affinity Server at ${
        this.affinityServiceUrl
      }!`
    );
  }

  private async createAffinityService() {
    if (!this.affinityServiceUrl) {
      return;
    }
    console.log("Creating affinity connection");
    const setUpConnection = this.setUpConnection.bind(this);
    await promiseRetry((retry, number) =>
      new Promise(async (resolve, reject) => {
        try {
          this.affinityService = new WebSocket(this.affinityServiceUrl, {
            perMessageDeflate: false
          });
          this.affinityService.on("error", err => {
            console.log("ERRER", err);
            reject();
          });
          this.affinityService.on("open", () => {
            setUpConnection();
            resolve();
          });
        } catch (e) {
          console.log(e.message);
          reject(e);
        }
      }).catch(retry)
    );
  }

  private heartbeat(): void {
    clearTimeout(this.pingTimeout);

    this.pingTimeout = setTimeout(() => {
      this.affinityService.terminate();
      this.affinityService = undefined as any;
      this.createAffinityService();
    }, 30000 + 1000);
  }

  private setUpConnection() {
    registerClient(this.affinityService);
    console.log(
      `Connected to Zeebe Affinity Service at ${this.affinityServiceUrl}`
    );
    this.heartbeat();

    this.affinityService.on("ping", this.heartbeat.bind(this));
    this.affinityService.on("message", this.handleMessage.bind(this));
  }

  private handleMessage(data) {
    const outcome = demarshalWorkflowOutcome(data);
    if (outcome) {
      const wfi = outcome.workflowInstanceKey;
      if (this.affinityCallbacks[wfi]) {
        this.affinityCallbacks[wfi](outcome);
        this.affinityCallbacks[wfi] = undefined as any; // Object.delete degrades performance with large objects
      }
    }
  }
}
