import { ClientOpts, RedisClient } from 'redis';
import { ProcessOutcome } from './WebSocketAPI';
import { ZeebeGrpcClient } from '@camunda8/sdk/dist/zeebe';
import { JSONDoc } from '@camunda8/sdk/dist/zeebe/lib/interfaces-1.0';
import { DeepPartial } from './ZeebeAffinityClient';
export declare class RedisAffinity extends ZeebeGrpcClient {
    subscriber: RedisClient;
    publisher: RedisClient;
    affinityCallbacks: {
        [processInstanceKey: string]: (processOutcome: ProcessOutcome) => void;
    };
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
    }, redisOptions: ClientOpts);
    createAffinityWorker(taskType: string): Promise<void>;
    createProcessInstanceWithAffinity<Variables extends JSONDoc>({ bpmnProcessId, variables, cb, }: {
        bpmnProcessId: string;
        variables: Variables;
        cb: (processOutcome: ProcessOutcome) => void;
    }): Promise<void>;
    publishMessageWithAffinity<Variables extends JSONDoc>({ correlationKey, messageId, name, variables, processInstanceKey, cb, }: {
        correlationKey: string;
        messageId: string;
        name: string;
        variables: Variables;
        processInstanceKey: string;
        cb: (processOutcome: ProcessOutcome) => void;
    }): Promise<void>;
    cleanup(channel: string): void;
}
