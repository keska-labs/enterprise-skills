/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  roots: ["<rootDir>/src", "<rootDir>/webview-ui"],
  moduleFileExtensions: ["ts", "tsx", "js"],
  setupFilesAfterEnv: ["<rootDir>/src/test/setupTests.ts"],
  testPathIgnorePatterns: ["<rootDir>/src/test/suite/"],
  moduleNameMapper: {
    "^vscode$": "<rootDir>/src/test/vscodeMock.ts",
    "\\.(css)$": "<rootDir>/src/test/styleMock.ts"
  },
  collectCoverageFrom: [
    "src/**/*.ts",
    "webview-ui/**/*.ts",
    "webview-ui/**/*.tsx",
    "!src/test/**"
  ],
  coverageThreshold: undefined
};
