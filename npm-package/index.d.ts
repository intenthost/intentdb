export interface QueryResult<T = any> {
  status: 'ok';
  rows: T[];
  rowCount: number;
  command: string;
  fields?: Array<{ name: string; dataTypeID: number }>;
}

export interface PingResult {
  status: 'ok' | 'error';
  response: string;
}

export interface IntentDbClient {
  /**
   * Tagged template SQL query:
   * const users = await db`SELECT * FROM users WHERE id = ${1}`;
   */
  <T = any>(strings: TemplateStringsArray, ...values: any[]): Promise<T[]>;

  /**
   * Standard SQL query as a function:
   * const res = await db('SELECT * FROM users WHERE id = $1', [1]);
   */
  <T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;

  /**
   * Explicit query method returning full result metadata:
   * const { rows, rowCount } = await db.query('SELECT * FROM users');
   */
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;

  /**
   * Atomic multi-query transaction:
   * await db.transaction([{ query: '...', params: [...] }]);
   */
  transaction(queries: Array<{ query: string; params?: any[] }>): Promise<{ status: 'ok'; results: QueryResult[] }>;

  /**
   * Parallel independent queries:
   * await db.batch([{ query: '...', params: [...] }]);
   */
  batch(queries: Array<{ query: string; params?: any[] }>): Promise<{ status: 'ok'; results: any[] }>;

  /**
   * Real-time round trip health & latency check:
   * const { status, response } = await db.ping();
   */
  ping(): Promise<PingResult>;
}

export function intentdb(connectionString?: string): IntentDbClient;
export function createClient(connectionString?: string): IntentDbClient;
export function sql<T = any>(strings: TemplateStringsArray, ...values: any[]): Promise<T[]>;

export default intentdb;
