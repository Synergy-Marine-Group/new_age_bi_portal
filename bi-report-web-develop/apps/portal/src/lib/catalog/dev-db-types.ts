/** Shared pool shape for direct pg and Lambda DB bridge (avoids Pool | BridgePool union on .query). */

export type DevDbQueryResult<T = Record<string, unknown>> = {
  rows: T[];
  rowCount: number;
};

export type DevDbPoolClient = {
  query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<DevDbQueryResult<T>>;
  release: (err?: boolean | Error) => void | Promise<void>;
};

export interface DevDbPool {
  query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<DevDbQueryResult<T>>;
  connect: () => Promise<DevDbPoolClient>;
  on: (event: "error", listener: (err: Error) => void) => DevDbPool;
  end: () => Promise<void>;
}