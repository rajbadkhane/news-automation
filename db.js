const mysql = require("mysql2/promise");
const { Pool } = require("pg");

function detectDialect() {
  const explicit = String(process.env.DB_DIALECT || process.env.DB_CLIENT || "").trim().toLowerCase();
  if (explicit === "postgresql") {
    return "postgres";
  }

  if (["mysql", "postgres"].includes(explicit)) {
    return explicit;
  }

  if (String(process.env.DATABASE_URL || "").trim()) {
    return "postgres";
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

function createPostgresPool() {
  const connectionString = String(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "").trim();
  if (!connectionString) {
    throw new Error("Postgres mode requires DATABASE_URL or SUPABASE_DB_URL.");
  }

  const sslMode = String(process.env.DB_SSL_MODE || "require").trim().toLowerCase();
  const ssl =
    sslMode === "disable"
      ? false
      : {
          rejectUnauthorized: false,
        };

  const pool = new Pool({
    connectionString,
    ssl,
    max: 10,
  });

  return {
    dialect: "postgres",
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
