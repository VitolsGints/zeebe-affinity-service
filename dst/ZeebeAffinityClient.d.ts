/// <reference types="node" />
import WebSocket from 'ws';
import { // Function to register a worker with the affinity service
ProcessOutcome } from './WebSocketAPI';
import { ZeebeGrpcClient } from '@camunda8/sdk/dist/zeebe';
import { ZBClientOptions } from '@camunda8/sdk/dist/zeebe/lib/interfaces-published-contract';
import { JSONDoc } from '@camunda8/sdk/dist/zeebe/lib/interfaces-1.0';
export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
export declare function filterVariables(variables: {
    [key: string]: any;
}): {
    [key: string]: string | number;
};
interface ZBAffinityClientOptions extends ZBClientOptions {
    affinityServiceUrl: string;
    affinityTimeout: number;
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
export declare class ZBAffinityClient extends ZeebeGrpcClient {
    affinityServiceUrl: string;
    affinityService: WebSocket;
    ws?: WebSocket;
    affinityCallbacks: {
        [processInstanceKey: string]: (processOutcome: ProcessOutcome) => void;
    };
    affinityTimeout: number;
    pingTimeout: NodeJS.Timeout;
    constructor(options: ZBAffinityClientOptions);
    createAffinityWorker(taskType: string): Promise<void>;
    createProcessInstanceWithAffinity<Variables extends JSONDoc>({ bpmnProcessId, variables, cb, }: {
        bpmnProcessId: string;
        variables: Variables;
        version?: number;
        cb: (processOutcome: ProcessOutcome) => void;
    }): Promise<unknown>;
    waitForAffinity(): Promise<void>;
    private throwNoConnection;
    private createAffinityService;
    private heartbeat;
    private setUpConnection;
    private handleMessage;
}
export {};
