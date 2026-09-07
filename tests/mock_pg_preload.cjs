// Preload script to inject Mock PostgreSQL Pool into bundled CJS server
const Module = require('module');
const originalRequire = Module.prototype.require;

const tables = {
  schema_migrations: [],
  cloud_machines: [],
  cloud_tickets: []
};

class MockClient {
  async query(sql, params) {
    const cleanSql = sql.trim();
    if (cleanSql.includes('FROM schema_migrations')) {
      return { rows: tables.schema_migrations.map(m => ({ version: m.version, name: m.name })) };
    }
    if (cleanSql.includes('INSERT INTO schema_migrations')) {
      tables.schema_migrations.push({ version: params[0], name: params[1] });
      return { rowCount: 1 };
    }
    if (cleanSql.includes('SELECT 1 as alive')) {
      return { rows: [{ alive: 1, server_time: new Date().toISOString() }] };
    }
    if (cleanSql.includes('SELECT COUNT(*) as cnt FROM cloud_machines')) {
      return { rows: [{ cnt: '0' }] };
    }
    return { rows: [], rowCount: 0 };
  }
  release() {}
}

class MockPool {
  constructor(config) {
    this.config = config;
  }
  async query(sql, params) {
    const client = new MockClient();
    return client.query(sql, params);
  }
  async connect() {
    return new MockClient();
  }
  async end() {}
}

Module.prototype.require = function (id) {
  if (id === 'pg') {
    return { Pool: MockPool };
  }
  return originalRequire.apply(this, arguments);
};
