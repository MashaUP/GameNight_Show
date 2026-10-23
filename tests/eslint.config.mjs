// Controllo del codice (ESLint): trova nomi non definiti, chiavi doppie e simili prima che arrivino nel browser.
// Uso: cd tests && npm run lint   (incluso in "npm test")
import globals from 'globals';

export default [{
  files: ['**/*.js'],
  languageOptions: {
    ecmaVersion: 2024,
    sourceType: 'module',
    // Librerie incluse in vendor/ e caricate con <script>
    globals: { ...globals.browser, firebase: 'readonly', qrcode: 'readonly', jsQR: 'readonly', DiceBear: 'readonly' }
  },
  linterOptions: { reportUnusedDisableDirectives: 'off' },
  rules: {
    'no-undef': 'error',
    'no-dupe-keys': 'error',
    'no-redeclare': 'error',
    'no-const-assign': 'error',
    'no-dupe-args': 'error',
    'no-unreachable': 'error'
  }
}];
