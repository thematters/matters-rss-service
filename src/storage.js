const nowIso = () => new Date().toISOString();

function todayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export class MemoryWebSubStorage {
  constructor() {
    this.subscriptions = new Map();
    this.topics = new Map();
    this.usage = new Map();
  }

  key(topic, callback) {
    return `${topic}\n${callback}`;
  }

  async upsertSubscription(subscription) {
    const key = this.key(subscription.topic, subscription.callback);
    this.subscriptions.set(key, {
      ...subscription,
      createdAt: this.subscriptions.get(key)?.createdAt || nowIso(),
      updatedAt: nowIso(),
    });
  }

  async deleteSubscription(topic, callback) {
    this.subscriptions.delete(this.key(topic, callback));
  }

  async listActiveSubscriptionsByTopic(topic, now = new Date()) {
    return [...this.subscriptions.values()].filter(
      (subscription) =>
        subscription.topic === topic && new Date(subscription.expiresAt) > now
    );
  }

  async listActiveTopics(now = new Date()) {
    const topics = new Set();
    for (const subscription of this.subscriptions.values()) {
      if (new Date(subscription.expiresAt) > now) {
        topics.add(subscription.topic);
      }
    }
    return [...topics].map((topic) => ({ topic }));
  }

  async getTopicState(topic) {
    return this.topics.get(topic) || null;
  }

  async upsertTopicState(topic, latestGuid) {
    this.topics.set(topic, {
      topic,
      latestGuid,
      checkedAt: nowIso(),
      updatedAt: nowIso(),
    });
  }

  async getUsage(date = todayKey()) {
    return this.usage.get(date) || { usageDate: date, checks: 0, deliveries: 0 };
  }

  async incrementUsage(date = todayKey(), field, amount = 1) {
    const usage = await this.getUsage(date);
    usage[field] = (usage[field] || 0) + amount;
    this.usage.set(date, usage);
    return usage;
  }
}

export class D1WebSubStorage {
  constructor(db) {
    this.db = db;
  }

  async upsertSubscription(subscription) {
    await this.db
      .prepare(
        `INSERT INTO websub_subscriptions
          (topic, callback, secret, lease_seconds, expires_at, created_at, updated_at, last_verified_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(topic, callback) DO UPDATE SET
          secret = excluded.secret,
          lease_seconds = excluded.lease_seconds,
          expires_at = excluded.expires_at,
          updated_at = CURRENT_TIMESTAMP,
          last_verified_at = CURRENT_TIMESTAMP,
          last_error = NULL`
      )
      .bind(
        subscription.topic,
        subscription.callback,
        subscription.secret || null,
        subscription.leaseSeconds,
        subscription.expiresAt
      )
      .run();
  }

  async deleteSubscription(topic, callback) {
    await this.db
      .prepare("DELETE FROM websub_subscriptions WHERE topic = ? AND callback = ?")
      .bind(topic, callback)
      .run();
  }

  async listActiveSubscriptionsByTopic(topic) {
    const result = await this.db
      .prepare(
        `SELECT topic, callback, secret, lease_seconds AS leaseSeconds, expires_at AS expiresAt
         FROM websub_subscriptions
         WHERE topic = ? AND datetime(expires_at) > datetime('now')
         ORDER BY created_at ASC`
      )
      .bind(topic)
      .all();
    return result.results || [];
  }

  async listActiveTopics() {
    const result = await this.db
      .prepare(
        `SELECT DISTINCT topic
         FROM websub_subscriptions
         WHERE datetime(expires_at) > datetime('now')
         ORDER BY topic ASC`
      )
      .all();
    return result.results || [];
  }

  async getTopicState(topic) {
    const result = await this.db
      .prepare(
        `SELECT topic, latest_guid AS latestGuid, checked_at AS checkedAt
         FROM websub_topics
         WHERE topic = ?`
      )
      .bind(topic)
      .first();
    return result || null;
  }

  async upsertTopicState(topic, latestGuid) {
    await this.db
      .prepare(
        `INSERT INTO websub_topics (topic, latest_guid, checked_at, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(topic) DO UPDATE SET
          latest_guid = excluded.latest_guid,
          checked_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP`
      )
      .bind(topic, latestGuid)
      .run();
  }

  async getUsage(date = todayKey()) {
    const result = await this.db
      .prepare(
        `SELECT usage_date AS usageDate, checks, deliveries
         FROM websub_usage
         WHERE usage_date = ?`
      )
      .bind(date)
      .first();
    return result || { usageDate: date, checks: 0, deliveries: 0 };
  }

  async incrementUsage(date = todayKey(), field, amount = 1) {
    const column = field === "deliveries" ? "deliveries" : "checks";
    await this.db
      .prepare(
        `INSERT INTO websub_usage (usage_date, checks, deliveries, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(usage_date) DO UPDATE SET
          ${column} = ${column} + ?,
          updated_at = CURRENT_TIMESTAMP`
      )
      .bind(date, column === "checks" ? amount : 0, column === "deliveries" ? amount : 0, amount)
      .run();
    return this.getUsage(date);
  }

  async recordDelivery(delivery) {
    await this.db
      .prepare(
        `INSERT INTO websub_deliveries
          (topic, callback, guid, status, status_code, error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
      )
      .bind(
        delivery.topic,
        delivery.callback,
        delivery.guid,
        delivery.status,
        delivery.statusCode || null,
        delivery.error || null
      )
      .run();
  }
}

export function createStorageFromEnv(env = {}) {
  if (env.DB) {
    return new D1WebSubStorage(env.DB);
  }
  if (!globalThis.__mattersRssMemoryStorage) {
    globalThis.__mattersRssMemoryStorage = new MemoryWebSubStorage();
  }
  return globalThis.__mattersRssMemoryStorage;
}

export { todayKey };
