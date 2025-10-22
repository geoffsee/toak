// Comprehensive fake secrets dataset for testing secret detection functionality
// These are NOT real credentials - they are for testing purposes only

export const fakeSecrets = {
  // API Keys - Various formats
  apiKeys: [
    {
      name: 'AWS API Key',
      code: `const aws_api_key = 'AKIAIOSFODNN7EXAMPLE';`,
      expected: `const aws_api_key = '[REDACTED]';`,
    },
    {
      name: 'Stripe API Key',
      code: `const stripe_key = 'sk_test_4eC39HqLyjWDarjtT1zdp7dc';`,
      expected: `const stripe_key = '[REDACTED]';`,
    },
    {
      name: 'API Key JSON format',
      code: `{"api_key": "abc123def456ghi789"}`,
      expected: `{"api_key": "[REDACTED]"}`,
    },
    {
      name: 'API Secret with hyphen',
      code: `const api-secret = 'my-super-secret-key-12345';`,
      expected: `const api-secret = '[REDACTED]';`,
    },
    {
      name: 'Client Secret',
      code: `client_secret = "cs_test_a1b2c3d4e5f6g7h8i9j0";`,
      expected: `client_secret = "[REDACTED]";`,
    },
  ],

  // JWT Tokens - Complete and partial
  jwtTokens: [
    {
      name: 'Standard JWT Token',
      code: `const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';`,
      expected: `const token = '[REDACTED_JWT]';`,
    },
    {
      name: 'JWT in Authorization',
      code: `Authorization: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjoiYWRtaW4ifQ.abc123`,
      expected: `Authorization: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjoiYWRtaW4ifQ.abc123`, // Note: This might not match all patterns
    },
    {
      name: 'Short JWT',
      code: `const jwt = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.e30.abc';`,
      expected: `const jwt = '[REDACTED_JWT]';`,
    },
  ],

  // Bearer Tokens
  bearerTokens: [
    {
      name: 'Basic Bearer Token',
      code: `Authorization: Bearer abcdef123456ghijkl789`,
      expected: `Authorization: Bearer [REDACTED]`,
    },
    {
      name: 'Bearer with special chars',
      code: `Authorization: Bearer token-with-hyphen_and_underscore.and.dot`,
      expected: `Authorization: Bearer [REDACTED]`,
    },
    {
      name: 'Lowercase bearer',
      code: `bearer xyz987654321`,
      expected: `bearer [REDACTED]`,
    },
    {
      name: 'Bearer in code',
      code: `fetch(url, { headers: { 'Authorization': 'Bearer sk_live_51234567890' } })`,
      expected: `fetch(url, { headers: { 'Authorization': 'Bearer [REDACTED]' } })`,
    },
  ],

  // Password fields
  passwords: [
    {
      name: 'Password in JSON',
      code: `{"username": "admin", "password": "SuperSecret123!"}`,
      expected: `{"username": "admin", "password": "[REDACTED]"}`,
    },
    {
      name: 'Password variable',
      code: `const password = "MyP@ssw0rd2024";`,
      expected: `const password = "[REDACTED]";`,
    },
    {
      name: 'DB Password',
      code: `const DB_PASSWORD = 'postgres_secret_2024!';`,
      expected: `const DB_PASSWORD = '[REDACTED]';`,
    },
  ],

  // Access Tokens
  accessTokens: [
    {
      name: 'OAuth Access Token',
      code: `"access_token": "ya29.a0AfH6SMBx..."`,
      expected: `"access_token": "[REDACTED]"`,
    },
    {
      name: 'Access Token Variable',
      code: `const access_token = 'gho_16C7e42F292c6912E7710c838347Ae178B4a';`,
      expected: `const access_token = '[REDACTED]';`,
    },
    {
      name: 'Auth Token',
      code: `auth_token = "token_abc123xyz789";`,
      expected: `auth_token = "[REDACTED]";`,
    },
  ],

  // Private Keys (simplified representations)
  privateKeys: [
    {
      name: 'Private Key variable',
      code: `const private_key = "MIIEvgIBADANBgkqhkiG9w0BAQEF";`,
      expected: `const private_key = "[REDACTED]";`,
    },
    {
      name: 'Secret Key',
      code: `secret_key = 'sk_production_abc123def456';`,
      expected: `secret_key = '[REDACTED]';`,
    },
  ],

  // Cryptographic Hashes - SHA-1 and SHA-256
  hashes: [
    {
      name: 'SHA-1 Hash (40 chars)',
      code: `const commit = 'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3';`,
      expected: `const commit = '[REDACTED_HASH]';`,
    },
    {
      name: 'SHA-256 Hash (64 chars)',
      code: `const hash = '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae';`,
      expected: `const hash = '[REDACTED_HASH]';`,
    },
    {
      name: 'Multiple hashes in text',
      code: `Hashes: a1b2c3d4e5f6789012345678901234567890abcd and 1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef`,
      expected: `Hashes: [REDACTED_HASH] and [REDACTED_HASH]`,
    },
    {
      name: 'Hash in JSON',
      code: `{"fileHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"}`,
      expected: `{"fileHash": "[REDACTED_HASH]"}`,
    },
  ],

  // Base64 Encoded Strings
  base64Strings: [
    {
      name: 'Base64 String (40 chars)',
      code: `const encoded = 'VGhpc0lzQVRlc3RTdHJpbmdGb3JCYXNlNjRFbmNv';`,
      expected: `const encoded = '[REDACTED_BASE64]';`,
    },
    {
      name: 'Base64 String (64 chars)',
      code: `token = "QWJjRGVmR2hpSmtsTW5vUHFyU3R1VndYeXpBYmNEZWZHaGlKa2xNbm9QcXJTdHVWd1h5eg==";`,
      expected: `token = "[REDACTED_BASE64]";`,
    },
    {
      name: 'Base64 with plus',
      code: `const b64 = 'dGVzdCtzdHJpbmcvd2l0aCtzcGVjaWFsK2NoYXJz';`,
      expected: `const b64 = '[REDACTED_BASE64]';`,
    },
  ],

  // Complex real-world scenarios
  complexScenarios: [
    {
      name: 'Config file with multiple secrets',
      code: `const config = {
  api_key: "sk_test_abc123",
  database: {
    password: "db_pass_xyz789"
  },
  jwt: "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiYWRtaW4ifQ.signature"
};`,
      expected: `const config = {
  api_key: "[REDACTED]",
  database: {
    password: "[REDACTED]"
  },
  jwt: "[REDACTED_JWT]"
};`,
    },
    {
      name: 'HTTP request with authorization',
      code: `fetch('https://api.example.com', {
  headers: {
    'Authorization': 'Bearer sk_live_1234567890abcdef',
    'X-API-Key': 'api_abc123xyz789'
  }
})`,
      expected: `fetch('https://api.example.com', {
  headers: {
    'Authorization': 'Bearer [REDACTED]',
    'X-API-Key': 'api_abc123xyz789'
  }
})`,
    },
    {
      name: 'Environment variables',
      code: `API_KEY=sk_production_xyz123
DATABASE_PASSWORD=super_secret_pass
AUTH_TOKEN=token_abc_def_123`,
      expected: `API_KEY=[REDACTED]
DATABASE_PASSWORD=[REDACTED]
AUTH_TOKEN=[REDACTED]`,
    },
    {
      name: 'Mixed secrets and hashes',
      code: `const data = {
  apiKey: "test_key_12345",
  checksum: "a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4",
  bearer: "Bearer token123456789"
};`,
      expected: `const data = {
  apiKey: "test_key_12345",
  checksum: "[REDACTED_HASH]",
  bearer: "Bearer [REDACTED]"
};`,
    },
  ],

  // .env file formats (CRITICAL - most common secret exposure vector)
  envFiles: [
    {
      name: '.env file with API key',
      code: `API_KEY=sk_live_1234567890abcdefghijklmnop`,
      expected: `API_KEY=[REDACTED]`,
    },
    {
      name: '.env file with database password',
      code: `DATABASE_PASSWORD=super_secret_password_123`,
      expected: `DATABASE_PASSWORD=[REDACTED]`,
    },
    {
      name: '.env file with JWT secret',
      code: `JWT_SECRET=my-super-secret-jwt-key-2024`,
      expected: `JWT_SECRET=[REDACTED]`,
    },
    {
      name: '.env with quotes',
      code: `API_SECRET="quoted-secret-value-xyz"`,
      expected: `API_SECRET=[REDACTED]`,
    },
    {
      name: '.env with single quotes',
      code: `PRIVATE_KEY='single-quoted-secret'`,
      expected: `PRIVATE_KEY=[REDACTED]`,
    },
    {
      name: '.env multiple secrets',
      code: `DB_HOST=localhost
DB_USER=admin
DB_PASSWORD=secretpass123
API_KEY=sk_prod_abc123
AUTH_TOKEN=token_xyz789`,
      expected: `DB_HOST=localhost
DB_USER=admin
DB_PASSWORD=[REDACTED]
API_KEY=[REDACTED]
AUTH_TOKEN=[REDACTED]`,
    },
    {
      name: '.env with export',
      code: `export SECRET_KEY="my-secret-key-value"`,
      expected: `export SECRET_KEY=[REDACTED]`,
    },
  ],

  // JSON configuration files
  jsonConfigs: [
    {
      name: 'JSON config with nested secrets',
      code: `{
  "database": {
    "host": "localhost",
    "password": "db_secret_pass_123"
  },
  "api": {
    "api_key": "sk_live_abcdefghijklmnop",
    "secret": "api_secret_xyz"
  }
}`,
      expected: `{
  "database": {
    "host": "localhost",
    "password": "[REDACTED]"
  },
  "api": {
    "api_key": "[REDACTED]",
    "secret": "[REDACTED]"
  }
}`,
    },
    {
      name: 'package.json with access token',
      code: `{
  "name": "my-app",
  "version": "1.0.0",
  "config": {
    "access_token": "ghp_1234567890abcdefghijklmnopqrst"
  }
}`,
      expected: `{
  "name": "my-app",
  "version": "1.0.0",
  "config": {
    "access_token": "[REDACTED]"
  }
}`,
    },
  ],

  // YAML/TOML configuration files
  yamlTomlConfigs: [
    {
      name: 'YAML config with secrets',
      code: `database:
  host: localhost
  password: "yaml_secret_pass_123"
api:
  api_key: "sk_test_abcdefg"
  client_secret: "cs_secret_xyz"`,
      expected: `database:
  host: localhost
  password: "[REDACTED]"
api:
  api_key: "[REDACTED]"
  client_secret: "[REDACTED]"`,
    },
    {
      name: 'TOML config with secrets',
      code: `[database]
host = "localhost"
password = "toml_secret_pass"

[api]
api_key = "sk_live_xyz123"`,
      expected: `[database]
host = "localhost"
password = "[REDACTED]"

[api]
api_key = "[REDACTED]"`,
    },
  ],

  // Cloud provider secrets (AWS, GCP, Azure)
  cloudSecrets: [
    {
      name: 'AWS Access Key ID',
      code: `AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE`,
      expected: `AWS_ACCESS_KEY_ID=[REDACTED]`,
    },
    {
      name: 'AWS Secret Access Key',
      code: `AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`,
      expected: `AWS_SECRET_ACCESS_KEY=[REDACTED]`,
    },
    {
      name: 'Google Cloud API Key',
      code: `GOOGLE_API_KEY=AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe`,
      expected: `GOOGLE_API_KEY=[REDACTED]`,
    },
    {
      name: 'Azure Client Secret',
      code: `AZURE_CLIENT_SECRET=8Q~abcdefghijklmnopqrstuvwxyz123456`,
      expected: `AZURE_CLIENT_SECRET=[REDACTED]`,
    },
  ],

  // Database connection strings
  connectionStrings: [
    {
      name: 'PostgreSQL connection string',
      code: `DATABASE_URL=postgresql://user:password123@localhost:5432/mydb`,
      expected: `DATABASE_URL=[REDACTED]`,
    },
    {
      name: 'MongoDB connection string',
      code: `MONGO_URI=mongodb://admin:secretpass@localhost:27017/db`,
      expected: `MONGO_URI=[REDACTED]`,
    },
    {
      name: 'MySQL connection string',
      code: `MYSQL_URL=mysql://root:mysqlpass123@localhost:3306/database`,
      expected: `MYSQL_URL=[REDACTED]`,
    },
  ],

  // Edge cases
  edgeCases: [
    {
      name: 'Empty string',
      code: `const apiKey = '';`,
      expected: `const apiKey = '';`,
    },
    {
      name: 'Short value (should not redact)',
      code: `const api_key = 'ab';`,
      expected: `const api_key = 'ab';`,
    },
    {
      name: 'Whitespace in value',
      code: `const password = "has spaces in it";`,
      expected: `const password = "[REDACTED]";`,
    },
    {
      name: 'Special characters in secret',
      code: `const secret_key = "!@#$%^&*()_+-={}[]|:;<>?,./";`,
      expected: `const secret_key = "[REDACTED]";`,
    },
    {
      name: 'URL with token',
      code: `const url = 'https://api.com?access_token=xyz123&other=param';`,
      expected: `const url = 'https://api.com?access_token=xyz123&other=param';`, // May not redact URL params
    },
  ],

  // False positives to avoid (these should NOT be redacted)
  shouldNotRedact: [
    {
      name: 'Regular variable names',
      code: `const apiKeyName = 'My API Key';`,
      expected: `const apiKeyName = 'My API Key';`,
    },
    {
      name: 'Comments about secrets',
      code: `// TODO: Add api_key validation`,
      expected: `// TODO: Add api_key validation`,
    },
    {
      name: 'Function names',
      code: `function getApiKey() { return loadKey(); }`,
      expected: `function getApiKey() { return loadKey(); }`,
    },
    {
      name: 'Short hex strings',
      code: `const color = '#ff00ff';`,
      expected: `const color = '#ff00ff';`,
    },
  ],
};

// Flattened array of all test cases for easy iteration
export const allSecretTests = [
  ...fakeSecrets.apiKeys,
  ...fakeSecrets.jwtTokens,
  ...fakeSecrets.bearerTokens,
  ...fakeSecrets.passwords,
  ...fakeSecrets.accessTokens,
  ...fakeSecrets.privateKeys,
  ...fakeSecrets.hashes,
  ...fakeSecrets.base64Strings,
  ...fakeSecrets.complexScenarios,
  ...fakeSecrets.envFiles,
  ...fakeSecrets.jsonConfigs,
  ...fakeSecrets.yamlTomlConfigs,
  ...fakeSecrets.cloudSecrets,
  ...fakeSecrets.connectionStrings,
  ...fakeSecrets.edgeCases,
];

// Export by category for targeted testing
export const secretsByCategory = {
  authentication: [...fakeSecrets.apiKeys, ...fakeSecrets.bearerTokens, ...fakeSecrets.accessTokens],
  cryptographic: [...fakeSecrets.hashes, ...fakeSecrets.base64Strings, ...fakeSecrets.jwtTokens],
  credentials: [...fakeSecrets.passwords, ...fakeSecrets.privateKeys],
  configFiles: [...fakeSecrets.envFiles, ...fakeSecrets.jsonConfigs, ...fakeSecrets.yamlTomlConfigs],
  cloudProvider: fakeSecrets.cloudSecrets,
  databases: fakeSecrets.connectionStrings,
  complex: fakeSecrets.complexScenarios,
  edge: fakeSecrets.edgeCases,
};