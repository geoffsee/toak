const filetypeExclusions = [
  // Images
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.bmp',
  '.svg',
  '.webp',
  '.tiff',
  '.ico',

  // Fonts
  '.ttf',
  '.woff',
  '.woff2',
  '.eot',
  '.otf',

  // Lock files
  '.lock',
  '.lockb',

  // Config files
  // '.yaml',
  // '.yml',
  // '.toml',
  // '.conf',

  // Binary and compiled
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.dat',
  '.pyc',
  '.pyo',
  '.class',
  '.jar',

  // Archives
  '.zip',
  '.tar',
  '.gz',
  '.rar',
  '.7z',

  // Media
  '.mp3',
  '.mp4',
  '.avi',
  '.mov',
  '.wav',

  // Database
  '.db',
  '.sqlite',
  '.sqlite3'
] as const;

export default filetypeExclusions;