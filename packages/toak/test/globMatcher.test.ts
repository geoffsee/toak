import { describe, it, expect } from 'bun:test';
import { isMatch, filter, matcher } from '../src/globMatcher';

describe('globMatcher', () => {
  describe('isMatch', () => {
    // Test basic glob patterns
    it('should match basic wildcards', () => {
      expect(isMatch('test.js', '*.js')).toBe(true);
      expect(isMatch('test.ts', '*.js')).toBe(false);
      expect(isMatch('src/test.js', '*.js')).toBe(false);
      expect(isMatch('test.config.js', '*.config.js')).toBe(true);
    });

    it('should match ** patterns', () => {
      expect(isMatch('src/components/Button.js', '**/*.js')).toBe(true);
      expect(isMatch('Button.js', '**/*.js')).toBe(true);
      expect(isMatch('src/deep/nested/file.js', '**/*.js')).toBe(true);
      expect(isMatch('src/components/Button.ts', '**/*.js')).toBe(false);
    });

    it('should match directory patterns', () => {
      expect(isMatch('node_modules/package/index.js', '**/node_modules/')).toBe(true);
      expect(isMatch('src/node_modules/test.js', '**/node_modules/')).toBe(true);
      expect(isMatch('node_modules_backup/test.js', '**/node_modules/')).toBe(false);
    });

    it('should handle ? wildcard', () => {
      expect(isMatch('test.js', 'tes?.js')).toBe(true);
      expect(isMatch('tesa.js', 'tes?.js')).toBe(true);
      expect(isMatch('test.js', 'te??.js')).toBe(true);
      expect(isMatch('testing.js', 'tes?.js')).toBe(false);
      expect(isMatch('text.js', 'tes?.js')).toBe(false); // 'x' != 's'
    });

    it('should handle brace expansion', () => {
      expect(isMatch('test.js', '*.{js,ts}')).toBe(true);
      expect(isMatch('test.ts', '*.{js,ts}')).toBe(true);
      expect(isMatch('test.jsx', '*.{js,ts}')).toBe(false);
      expect(isMatch('config.json', '*.{json,yaml,yml}')).toBe(true);
    });

    // Test actual patterns from fileExclusions
    it('should match config patterns from fileExclusions', () => {
      expect(isMatch('.prettierrc', '**/.*rc')).toBe(true);
      expect(isMatch('src/.eslintrc', '**/.*rc')).toBe(true);
      expect(isMatch('.babelrc.js', '**/.*rc.{js,json,yaml,yml}')).toBe(true);
      expect(isMatch('webpack.config.js', '**/*.config.{js,ts}')).toBe(true);
      expect(isMatch('tsconfig.json', '**/tsconfig.json')).toBe(true);
      expect(isMatch('src/tsconfig.build.json', '**/tsconfig*.json')).toBe(true);
    });

    it('should match environment and secret patterns', () => {
      expect(isMatch('.env', '**/.env*')).toBe(true);
      expect(isMatch('.env.local', '**/.env*')).toBe(true);
      expect(isMatch('src/.env.production', '**/.env*')).toBe(true);
      expect(isMatch('config.vars', '**/*.vars')).toBe(true);
      expect(isMatch('secrets.json', '**/secrets.*')).toBe(true);
    });

    it('should match dependency directories', () => {
      expect(isMatch('node_modules/', '**/node_modules/')).toBe(true);
      expect(isMatch('src/node_modules/', '**/node_modules/')).toBe(true);
      expect(isMatch('build/', '**/build/')).toBe(true);
      expect(isMatch('dist/bundle.js', '**/dist/')).toBe(true);
      expect(isMatch('__pycache__/', '**/__pycache__/')).toBe(true);
    });

    it('should match documentation patterns', () => {
      expect(isMatch('README.md', '**/README*')).toBe(true);
      expect(isMatch('src/README.txt', '**/README*')).toBe(true);
      expect(isMatch('CHANGELOG.md', '**/CHANGELOG*')).toBe(true);
      expect(isMatch('LICENSE', '**/LICENSE*')).toBe(true);
      expect(isMatch('docs/', '**/docs/')).toBe(true);
    });

    it('should match IDE patterns', () => {
      expect(isMatch('.vscode/', '**/.{idea,vscode,eclipse,settings,zed,cursor}/')).toBe(true);
      expect(isMatch('.idea/', '**/.{idea,vscode,eclipse,settings,zed,cursor}/')).toBe(true);
      expect(isMatch('.cursor/settings.json', '**/.{idea,vscode,eclipse,settings,zed,cursor}/')).toBe(true);
    });

    it('should match test patterns', () => {
      expect(isMatch('test/', '**/test{s,}/')).toBe(true);
      expect(isMatch('tests/', '**/test{s,}/')).toBe(true);
      expect(isMatch('__tests__/', '**/__tests__/')).toBe(true);
      expect(isMatch('button.test.js', '**/*.{test,spec}.*')).toBe(true);
      expect(isMatch('api.spec.ts', '**/*.{test,spec}.*')).toBe(true);
      expect(isMatch('coverage/', '**/coverage/')).toBe(true);
      expect(isMatch('jest.config.js', '**/jest.config.*')).toBe(true);
    });

    it('should handle dot option', () => {
      expect(isMatch('.hidden', '.*', { dot: true })).toBe(true);
      expect(isMatch('.hidden', '.*', { dot: false })).toBe(true); // Pattern explicitly matches dot
      expect(isMatch('.hidden/file.js', '**/*.js', { dot: true })).toBe(true);
      expect(isMatch('.hidden/file.js', '**/*.js', { dot: false })).toBe(false);
    });

    it('should handle multiple patterns', () => {
      const patterns = ['*.js', '*.ts', '*.jsx'];
      expect(isMatch('test.js', patterns)).toBe(true);
      expect(isMatch('test.ts', patterns)).toBe(true);
      expect(isMatch('test.jsx', patterns)).toBe(true);
      expect(isMatch('test.css', patterns)).toBe(false);
    });

    it('should handle negation patterns', () => {
      expect(isMatch('test.js', ['*.js', '!test.js'])).toBe(false);
      expect(isMatch('other.js', ['*.js', '!test.js'])).toBe(true);
      expect(isMatch('node_modules/test.js', ['**/*.js', '!**/node_modules/**'])).toBe(false);
    });
  });

  describe('filter', () => {
    it('should filter array of files', () => {
      const files = [
        'index.js',
        'style.css',
        'test.spec.js',
        'README.md',
        'src/component.js'
      ];

      expect(filter(files, '*.js')).toEqual(['index.js', 'test.spec.js']);
      expect(filter(files, '**/*.js')).toEqual([
        'index.js',
        'test.spec.js',
        'src/component.js'
      ]);
      expect(filter(files, ['*.md', '*.css'])).toEqual([
        'style.css',
        'README.md'
      ]);
    });
  });

  describe('matcher', () => {
    it('should create a reusable matcher function', () => {
      const matchJS = matcher('**/*.js');

      expect(matchJS('test.js')).toBe(true);
      expect(matchJS('src/index.js')).toBe(true);
      expect(matchJS('test.ts')).toBe(false);

      const matchConfig = matcher(['*.config.js', 'tsconfig*.json']);
      expect(matchConfig('webpack.config.js')).toBe(true);
      expect(matchConfig('tsconfig.json')).toBe(true);
      expect(matchConfig('index.js')).toBe(false);
    });
  });

  describe('compatibility with actual usage', () => {
    it('should work exactly like micromatch.isMatch in MarkdownGenerator', () => {
      // This test mimics the exact usage in MarkdownGenerator.ts
      const fileExclusions = [
        '**/node_modules/',
        '**/.env*',
        '**/*.config.{js,ts}',
        '**/test{s,}/',
        '**/*.{test,spec}.*'
      ];

      // Test files that should be excluded
      expect(isMatch('node_modules/package/index.js', fileExclusions, { dot: true })).toBe(true);
      expect(isMatch('.env.local', fileExclusions, { dot: true })).toBe(true);
      expect(isMatch('webpack.config.js', fileExclusions, { dot: true })).toBe(true);
      expect(isMatch('tests/unit.js', fileExclusions, { dot: true })).toBe(true);
      expect(isMatch('button.test.tsx', fileExclusions, { dot: true })).toBe(true);

      // Test files that should NOT be excluded
      expect(isMatch('src/index.js', fileExclusions, { dot: true })).toBe(false);
      expect(isMatch('components/Button.tsx', fileExclusions, { dot: true })).toBe(false);
      expect(isMatch('utils/helpers.js', fileExclusions, { dot: true })).toBe(false);
    });
  });
});