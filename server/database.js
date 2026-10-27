/**
 * Share one SQL Server connection pool across catalogue and cart requests.
 * The ODBC connection string stays on the server and supports Windows authentication.
 * Connect lazily so missing configuration produces an API error without breaking Vite.
 */
export function createDatabase(connectionString, env = {}) {
  let pending

  async function getPool() {
    if (!connectionString && !(env.DB_SERVER && env.DB_USER && env.DB_PASSWORD))
      throw new Error('Configure the backend database connection.')
    if (!pending) {
      pending = (async () => {
        const { default: sql } = await import(connectionString ? 'mssql/msnodesqlv8.js' : 'mssql')
        const pool = new sql.ConnectionPool({
          ...(connectionString
            ? { connectionString }
            : {
                server: env.DB_SERVER,
                database: env.DB_NAME || 'StoreDB',
                user: env.DB_USER,
                password: env.DB_PASSWORD,
                port: Number(env.DB_PORT || 1433),
                options: {
                  encrypt: true,
                  trustServerCertificate: env.DB_TRUST_CERTIFICATE === 'true',
                },
              }),
          connectionTimeout: 5000,
          requestTimeout: 10000,
          pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
        })
        // Requests report failures separately; never include connection details in logs.
        pool.on('error', () => console.error('StoreDB connection failed.'))
        try {
          return await pool.connect()
        } catch (error) {
          await pool.close()
          throw error
        }
      })().catch((error) => {
        pending = undefined
        throw error
      })
    }
    return pending
  }

  async function close() {
    const connection = pending
    pending = undefined
    if (connection) {
      const pool = await connection.catch(() => null)
      await pool?.close()
    }
  }

  return { getPool, close }
}
