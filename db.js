const mysql = require("mysql2/promise");
const { Pool } = require("pg");

function detectDialect() {
  const explicit = String(process.env.DB_DIALECT || process.env.DB_CLIENT || "").trim().toLowerCase();
  const databaseUrl = String(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "").trim();

  if (databaseUrl) {
    return "postgres";
  }

  if (explicit === "postgresql") {
    return "postgres";
  }

  if (["mysql", "postgres"].includes(explicit)) {
    return explicit;
  }

  return "mysql";
}

function convertPlaceholders(sql) {
  let index = 0;
  return String(sql).replace(/\?/g, () => `$${++index}`);
}

function isSelectQuery(sql) {
  return /^\s*(select|with)\b/i.test(String(sql || ""));
}

function isDuplicateColumnError(error, dialect) {
  return dialect === "postgres"
    ? error?.code === "42701"
    : error?.code === "ER_DUP_FIELDNAME";
}

function isDuplicateKeyError(error, dialect) {
  return dialect === "postgres"
    ? error?.code === "42P07" || error?.code === "42710"
    : error?.code === "ER_DUP_KEYNAME";
}

function createMysqlPool() {
  const DB_HOST = process.env.DB_HOST || "127.0.0.1";
  const DB_PORT = Number(process.env.DB_PORT || 3306);
  const DB_USER = process.env.DB_USER || "root";
  const DB_PASSWORD = process.env.DB_PASSWORD || "";
  const DB_NAME = process.env.DB_NAME || "gautam_news_bot";

  return mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });
}

function resolvePostgresConnectionString(rawConnectionString, databasePassword) {
  let connectionString = rawConnectionString;

  if (databasePassword) {
    if (connectionString.includes("[YOUR-PASSWORD]")) {
      connectionString = connectionString.replace("[YOUR-PASSWORD]", encodeURIComponent(databasePassword));
    } else if (connectionString.includes("<YOUR-PASSWORD>")) {
      connectionString = connectionString.replace("<YOUR-PASSWORD>", encodeURIComponent(databasePassword));
    } else {
      try {
        const connectionUrl = new URL(connectionString);
        if (!connectionUrl.password) {
          connectionUrl.password = databasePassword;
          connectionString = connectionUrl.toString();
        }
      } catch {
        connectionString = rawConnectionString;
      }
    }
  }

  return connectionString;
}

function buildPostgresConnectionCandidates(rawConnectionString, databasePassword) {
  const configuredConnectionString = resolvePostgresConnectionString(rawConnectionString, databasePassword);
  const candidates = [
    {
      name: "configured",
      connectionString: configuredConnectionString,
    },
  ];

  try {
    const configuredUrl = new URL(configuredConnectionString);
    const hostname = configuredUrl.hostname.toLowerCase();
    const isSupabasePooler = hostname.includes("pooler.supabase.com");
    const inferredProjectRef = String(configuredUrl.username || "").startsWith("postgres.")
      ? String(configuredUrl.username).slice("postgres.".length)
      : "";

    if (isSupabasePooler && inferredProjectRef) {
      const directUrl = new URL(configuredConnectionString);
      directUrl.hostname = `db.${inferredProjectRef}.supabase.co`;
      directUrl.port = "5432";
      directUrl.username = "postgres";
      if (databasePassword) {
        directUrl.password = databasePassword;
      }

      const directConnectionString = directUrl.toString();
      if (directConnectionString !== configuredConnectionString) {
        candidates.push({
          name: "supabase-direct",
          connectionString: directConnectionString,
        });
      }
    }
  } catch {
    // Ignore URL parsing failures and keep the configured candidate only.
  }

  return candidates;
}

function createPostgresPoolWrapper(pool, sourceName) {
  return {
    dialect: "postgres",
    sourceName,
    async query(sql, params = []) {
      const text = convertPlaceholders(sql);
      const result = await pool.query(text, params);
      if (isSelectQuery(sql)) {
        return [result.rows, result];
      }

      return [
        {
          affectedRows: result.rowCount || 0,
          insertId: result.rows?.[0]?.id ?? null,
          rows: result.rows || [],
        },
        result,
      ];
    },
    async execute(sql, params = []) {
      return this.query(sql, params);
    },
    async end() {
      await pool.end();
    },
  };
}

async function createPostgresPool() {
  const rawConnectionString = String(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "").trim();
  if (!rawConnectionString) {
    throw new Error("Postgres mode requires DATABASE_URL or SUPABASE_DB_URL.");
  }

  const databasePassword = String(process.env.DB_PASSWORD || process.env.SUPABASE_DB_PASSWORD || "").trim();
  const needsPasswordPlaceholder = rawConnectionString.includes("[YOUR-PASSWORD]") || rawConnectionString.includes("<YOUR-PASSWORD>");
  if (!databasePassword && needsPasswordPlaceholder) {
    throw new Error("Postgres mode requires DB_PASSWORD or SUPABASE_DB_PASSWORD when DATABASE_URL contains a password placeholder.");
  }

  const sslMode = String(process.env.DB_SSL_MODE || "require").trim().toLowerCase();
  const ssl =
    sslMode === "disable"
      ? false
      : {
          rejectUnauthorized: false,
        };

  const candidates = buildPostgresConnectionCandidates(rawConnectionString, databasePassword);
  let lastError = null;

  for (const candidate of candidates) {
    const pool = new Pool({
      connectionString: candidate.connectionString,
      ssl,
      max: 10,
    });

    try {
      await pool.query("SELECT 1 AS ok");
      return createPostgresPoolWrapper(pool, candidate.name);
    } catch (error) {
      lastError = error;
      await pool.end().catch(() => {});
    }
  }

  const lastErrorMessage = lastError && lastError.message ? lastError.message : "Unknown connection error";
  throw new Error(`Unable to connect to Postgres using the configured Supabase connection string. Last error: ${lastErrorMessage}`);
}

async function createDatabasePool() {
  const dialect = detectDialect();
  if (dialect === "postgres") {
    return createPostgresPool();
  }

  const DB_HOST = process.env.DB_HOST || "127.0.0.1";
  const DB_PORT = Number(process.env.DB_PORT || 3306);
  const DB_USER = process.env.DB_USER || "root";
  const DB_PASSWORD = process.env.DB_PASSWORD || "";
  const DB_NAME = process.env.DB_NAME || "gautam_news_bot";

  const bootstrapConnection = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
  });

  await bootstrapConnection.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await bootstrapConnection.end();

  const pool = createMysqlPool();
  pool.dialect = "mysql";
  return pool;
}

module.exports = {
  createDatabasePool,
  detectDialect,
  isDuplicateColumnError,
  isDuplicateKeyError,
};
