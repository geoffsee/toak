export default [
  // Config patterns
  '**/.*rc',
  '**/.*rc.{js,json,yaml,yml}',
  '**/*.config.{js,ts}',
  '**/tsconfig.json',
  '**/tsconfig*.json',
  '**/jsconfig.json',
  '**/jsconfig*.json',
  '**/package-lock.json',
  '**/.prettierignore',
  '**/.dockerignore',
  // Environment and variables
  '**/.env*',
  '**/*.vars',
  '**/secrets.*',

  // Version control
  '**/.git*',
  '**/.hg*',
  '**/.svn*',
  '**/CVS',
  '**/.github/',

  // CI/CD
  '**/.gitlab-ci.yml',
  '**/azure-pipelines.yml',
  '**/jenkins*',

  // Dependency directories
  '**/node_modules/',
  '**/target/',
  '**/__pycache__/',
  '**/venv/',
  '**/.venv/',
  '**/env/',
  '**/build/',
  '**/dist/',
  '**/out/',
  '**/bin/',
  '**/obj/',

  // Documentation
  '**/README*',
  '**/CHANGELOG*',
  '**/CONTRIBUTING*',
  '**/LICENSE*',
  '**/docs/',
  '**/documentation/',

  // IDE and editors
  '**/.{idea,vscode,eclipse,settings,zed,cursor}/',
  '**/.project',
  '**/.classpath',
  '**/.factorypath',

  // Test and data
  '**/test{s,}/',
  '**/spec/',
  '**/fixtures/',
  '**/testdata/',
  '**/__tests__/',
  '**/*.{test,spec}.*',
  '**/coverage/',
  '**/jest.config.*',

  // Logs and temporary files
  '**/logs/',
  '**/tmp/',
  '**/temp/',
  '**/*.log'
] as const;