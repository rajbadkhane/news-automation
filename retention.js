const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function parseBooleanEnv(value, defaultValue = true) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function parsePositiveIntEnv(value, defaultValue, minValue = 1, maxValue = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < minValue) {
    return defaultValue;
  }

  return Math.min(parsed, maxValue);
}

function loadRetentionConfig(env = process.env) {
  return {
    enabled: parseBooleanEnv(env.RETENTION_ENABLED, true),
    intervalMs: parsePositiveIntEnv(env.RETENTION_CLEANUP_INTERVAL_MS, 60 * 60 * 1000, 60_000),
    batchSize: parsePositiveIntEnv(env.RETENTION_BATCH_SIZE, 2000, 100),
    maxPasses: parsePositiveIntEnv(env.RETENTION_MAX_PASSES, 20, 1, 100),
    tables: [
      {
        tableName: "ai_news_rewrites",
        timestampExpression: "COALESCE(published_at, updated_at)",
        keepDays: parsePositiveIntEnv(env.AI_REWRITE_RETENTION_DAYS, 45, 1),
        maxRows: parsePositiveIntEnv(env.AI_REWRITE_MAX_ROWS, 5000, 1),
      },
      {
        tableName: "fetched_news",
        timestampExpression: "fetched_at",
        keepDays: parsePositiveIntEnv(env.FETCHED_NEWS_RETENTION_DAYS, 45, 1),
        maxRows: parsePositiveIntEnv(env.FETCHED_NEWS_MAX_ROWS, 10000, 1),
        dependentDeletes: [
          {
            tableName: "ai_news_rewrites",
            foreignKeyColumn: "news_id",
          },
        ],
      },
      {
        tableName: "scheduler_runs",
        timestampExpression: "started_at",
        keepDays: parsePositiveIntEnv(env.SCHEDULER_RUNS_RETENTION_DAYS, 30, 1),
        maxRows: parsePositiveIntEnv(env.SCHEDULER_RUNS_MAX_ROWS, 2000, 1),
      },
      {
        tableName: "api_usage_logs",
        timestampExpression: "created_at",
        keepDays: parsePositiveIntEnv(env.API_USAGE_LOG_RETENTION_DAYS, 14, 1),
        maxRows: parsePositiveIntEnv(env.API_USAGE_LOG_MAX_ROWS, 5000, 1),
      },
      {
        tableName: "admin_audit_logs",
        timestampExpression: "created_at",
        keepDays: parsePositiveIntEnv(env.ADMIN_AUDIT_LOG_RETENTION_DAYS, 90, 1),
        maxRows: parsePositiveIntEnv(env.ADMIN_AUDIT_LOG_MAX_ROWS, 5000, 1),
      },
    ],
  };
}

function buildCutoffDate(keepDays) {
  if (!keepDays || keepDays < 1) {
    return null;
  }

  return new Date(Date.now() - (keepDays * MILLISECONDS_PER_DAY));
}

function buildRetentionWhereClause({ additionalWhereSql = null, additionalWhereParams = [], cutoffExpression = null, cutoffValue = null }) {
  const conditions = [];
  const params = [];

  if (additionalWhereSql) {
    conditions.push(`(${additionalWhereSql})`);
    params.push(...additionalWhereParams);
  }

  if (cutoffExpression && cutoffValue) {
    conditions.push(`${cutoffExpression} < ?`);
    params.push(cutoffValue);
  }

  return {
    whereClause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

async function selectOldestIds(dbPool, tableName, orderExpression, whereClause, params, limit) {
  if (!limit || limit < 1) {
    return [];
  }

  const [rows] = await dbPool.execute(
    `
      SELECT id
      FROM ${tableName}
      ${whereClause}
      ORDER BY ${orderExpression} ASC, id ASC
      LIMIT ?
    `,
    [...params, limit]
  );

  return rows.map((row) => row.id).filter((value) => value !== undefined && value !== null);
}

async function countEligibleRows(dbPool, tableName, whereClause, params) {
  const [rows] = await dbPool.execute(
    `
      SELECT COUNT(*) AS total
      FROM ${tableName}
      ${whereClause}
    `,
    params
  );

  return Number(rows[0]?.total || 0);
}

async function deleteRowsByIds(dbPool, tableName, ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return 0;
  }

  const placeholders = ids.map(() => "?").join(", ");
  const [result] = await dbPool.execute(
    `
      DELETE FROM ${tableName}
      WHERE id IN (${placeholders})
    `,
    ids
  );

  return Number(result?.affectedRows || result?.rowCount || ids.length || 0);
}

async function deleteRowsByForeignKeys(dbPool, tableName, foreignKeyColumn, values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  const batchSize = 500;
  let deletedTotal = 0;

  for (let index = 0; index < values.length; index += batchSize) {
    const batch = values.slice(index, index + batchSize);
    const placeholders = batch.map(() => "?").join(", ");
    const [result] = await dbPool.execute(
      `
        DELETE FROM ${tableName}
        WHERE ${foreignKeyColumn} IN (${placeholders})
      `,
      batch
    );

    deletedTotal += Number(result?.affectedRows || result?.rowCount || batch.length || 0);
  }

  return deletedTotal;
}

async function cleanupTable(dbPool, tableConfig, runtimeConfig) {
  const summary = {
    table: tableConfig.tableName,
    deleted: 0,
    age_deleted: 0,
    cap_deleted: 0,
    dependent_deleted: 0,
    eligible_remaining: 0,
    total_remaining: 0,
    keep_days: tableConfig.keepDays,
    max_rows: tableConfig.maxRows,
  };

  const cutoff = buildCutoffDate(tableConfig.keepDays);
  const maxPasses = runtimeConfig.maxPasses;
  const batchSize = runtimeConfig.batchSize;
  const dependentDeletes = Array.isArray(tableConfig.dependentDeletes) ? tableConfig.dependentDeletes : [];
  const ageFilters = cutoff
    ? buildRetentionWhereClause({
        cutoffExpression: tableConfig.timestampExpression,
        cutoffValue: cutoff,
      })
    : {
        whereClause: "",
        params: [],
      };

  async function deleteDependentRows(ids) {
    let dependentDeleted = 0;

    for (const dependency of dependentDeletes) {
      dependentDeleted += await deleteRowsByForeignKeys(
        dbPool,
        dependency.tableName,
        dependency.foreignKeyColumn,
        ids
      );
    }

    return dependentDeleted;
  }

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let passDeleted = 0;

    if (cutoff) {
      const ageIds = await selectOldestIds(
        dbPool,
        tableConfig.tableName,
        tableConfig.timestampExpression,
        ageFilters.whereClause,
        ageFilters.params,
        batchSize
      );

      if (ageIds.length > 0) {
        const dependentDeletedCount = await deleteDependentRows(ageIds);
        const deletedCount = await deleteRowsByIds(dbPool, tableConfig.tableName, ageIds);

        summary.dependent_deleted += dependentDeletedCount;
        summary.age_deleted += deletedCount;
        summary.deleted += dependentDeletedCount + deletedCount;
        passDeleted += dependentDeletedCount + deletedCount;
      }
    }

    if (tableConfig.maxRows > 0) {
      const totalCount = await countEligibleRows(dbPool, tableConfig.tableName, "", []);

      if (totalCount > tableConfig.maxRows) {
        const excessCount = totalCount - tableConfig.maxRows;
        const capIds = await selectOldestIds(
          dbPool,
          tableConfig.tableName,
          tableConfig.timestampExpression,
          "",
          [],
          Math.min(batchSize, excessCount)
        );

        if (capIds.length > 0) {
          const dependentDeletedCount = await deleteDependentRows(capIds);
          const deletedCount = await deleteRowsByIds(dbPool, tableConfig.tableName, capIds);

          summary.dependent_deleted += dependentDeletedCount;
          summary.cap_deleted += deletedCount;
          summary.deleted += dependentDeletedCount + deletedCount;
          passDeleted += dependentDeletedCount + deletedCount;
        }
      }
    }

    if (passDeleted === 0) {
      break;
    }
  }

  summary.total_remaining = await countEligibleRows(dbPool, tableConfig.tableName, "", []);
  summary.eligible_remaining = cutoff
    ? await countEligibleRows(dbPool, tableConfig.tableName, ageFilters.whereClause, ageFilters.params)
    : summary.total_remaining;

  return summary;
}

async function runDatabaseRetentionCleanup(dbPool, runtimeConfig = loadRetentionConfig()) {
  if (!dbPool || !runtimeConfig.enabled) {
    return {
      enabled: false,
      tables: [],
      deleted_total: 0,
    };
  }

  const tables = [];
  let deletedTotal = 0;

  for (const tableConfig of runtimeConfig.tables) {
    const tableSummary = await cleanupTable(dbPool, tableConfig, runtimeConfig);
    tables.push(tableSummary);
    deletedTotal += tableSummary.deleted;
  }

  return {
    enabled: true,
    tables,
    deleted_total: deletedTotal,
    interval_ms: runtimeConfig.intervalMs,
    batch_size: runtimeConfig.batchSize,
    max_passes: runtimeConfig.maxPasses,
    cleaned_at: new Date().toISOString(),
  };
}

module.exports = {
  loadRetentionConfig,
  runDatabaseRetentionCleanup,
};
