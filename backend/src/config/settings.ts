export const CONFIG = {
  NODE_ENV: process.env.NODE_ENV || 'development',

  API: {
    PORT: parseInt(process.env.PORT || '8080', 10),
    CORS_ORIGIN: process.env.CORS_ORIGIN || '*'
  },

  SECURITY: {
    ALLOWED_FRAME_ANCESTORS: process.env.ALLOWED_FRAME_ANCESTORS?.split(',') || ["'self'", "*"],
    DISABLE_HTTPS_UPGRADE: process.env.DISABLE_HTTPS_UPGRADE === 'true'
  },

  DATABASE: {
    PATH: process.env.DB_PATH || './data/growflow.db'
  },

  UPLOADS: {
    PATH: process.env.UPLOADS_PATH || './data/uploads',
    MAX_SIZE_MB: parseInt(process.env.UPLOADS_MAX_SIZE_MB || '10', 10),
    ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
    MAX_PER_EVENT: 10
  },

  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  HOME_ASSISTANT: {
    SUPERVISOR_TOKEN: process.env.SUPERVISOR_TOKEN,
    URL: process.env.HA_URL,
    TOKEN: process.env.HA_TOKEN,
    RECONNECT_BASE_MS: parseInt(process.env.HA_RECONNECT_BASE_MS || '1000', 10),
    RECONNECT_MAX_MS: parseInt(process.env.HA_RECONNECT_MAX_MS || '30000', 10)
  },

  CONTROLLER: {
    ENABLED: process.env.CONTROLLER_ENABLED === 'true',
    INTERVAL_MS: parseInt(process.env.CONTROLLER_INTERVAL_MS || '15000', 10),
    STALE_AFTER_MS: parseInt(process.env.CONTROLLER_STALE_AFTER_MS || String(10 * 60 * 1000), 10),
    TIMEZONE: process.env.CONTROLLER_TIMEZONE || process.env.TZ,
    STAGING_DELAY_S: parseInt(process.env.CONTROLLER_STAGING_DELAY_S || '120', 10),
    VENTILATION_MIN_SPEED_PERCENT: parseInt(process.env.CONTROLLER_VENTILATION_MIN_SPEED_PERCENT || '25', 10),
    VENTILATION_SPEED_DEADBAND_PERCENT: parseInt(process.env.CONTROLLER_VENTILATION_SPEED_DEADBAND_PERCENT || '5', 10)
  },

  RECORDER: {
    ENABLED: process.env.RECORDER_ENABLED !== 'false',
    INTERVAL_MS: parseInt(process.env.RECORDER_INTERVAL_MS || '60000', 10),
    RETENTION_DAYS: parseInt(process.env.RETENTION_DAYS || '180', 10)
  }
};