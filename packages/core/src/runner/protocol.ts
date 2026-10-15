import type { SerializedValue } from '../serializer/types';

export type { SerializedValue };

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
}

export interface RunMessage {
  type: 'run';
  runId: string;
  source: string;
  timeoutMs: number;
}

export interface ConsoleMessage {
  type: 'console';
  runId: string;
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  args: SerializedValue[];
}

export interface DoneMessage {
  type: 'done';
  runId: string;
}

export interface ErrorMessage {
  type: 'error';
  runId: string;
  error: SerializedError;
}

export type MainToWorkerMessage = RunMessage;
export type WorkerToMainMessage = ConsoleMessage | DoneMessage | ErrorMessage;
