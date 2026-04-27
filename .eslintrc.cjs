module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: "module"
  },
  env: {
    node: true,
    es6: true,
    jest: true,
    browser: true
  },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  ignorePatterns: ["dist", "node_modules", "coverage"],
  rules: {
    "@typescript-eslint/no-explicit-any": "off"
  }
};
