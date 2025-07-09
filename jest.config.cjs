// jest.config.cjs
module.exports = {
    testEnvironment: "node",
  
    // Map imports so Jest can resolve ESM modules
    moduleNameMapper: {
      "^(\\.{1,2}/.*)\\.js$": "$1"
    },
  
    // Optional: coverage thresholds, etc.
    coverageThreshold: {
      global: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90
      }
    }
  };
  