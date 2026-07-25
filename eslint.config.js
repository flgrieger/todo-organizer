"use strict";
// Flat ESLint config (CommonJS — matches package.json having no "type": "module").
module.exports = [
  {
    files: ["logic.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { module: "readonly", globalThis: "readonly" },
    },
    rules: {
      "no-unused-vars": "warn",
      "eqeqeq": "error",
      "no-undef": "error",
    },
  },
  {
    files: ["logic.test.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: { require: "readonly", module: "readonly" },
    },
    rules: {
      "no-unused-vars": "warn",
      "eqeqeq": "error",
      "no-undef": "error",
    },
  },
  {
    // Cloudflare Worker (service-worker format) — runtime globals + the Node export guard.
    files: ["sync-worker/worker.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        addEventListener: "readonly", Response: "readonly", URL: "readonly",
        globalThis: "readonly", module: "readonly", console: "readonly",
      },
    },
    rules: {
      "no-unused-vars": "warn",
      "eqeqeq": "error",
      "no-undef": "error",
    },
  },
  {
    files: ["sync-worker/worker.test.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: { require: "readonly", module: "readonly" },
    },
    rules: {
      "no-unused-vars": "warn",
      "eqeqeq": "error",
      "no-undef": "error",
    },
  },
];
