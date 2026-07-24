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
];
