const path = require("path");

/** @type {import('webpack').Configuration[]} */
module.exports = [
  {
    name: "extension",
    target: "node",
    mode: "none",
    entry: "./src/extension.ts",
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "extension.js",
      libraryTarget: "commonjs2"
    },
    externals: {
      vscode: "commonjs vscode"
    },
    resolve: {
      extensions: [".ts", ".js"]
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: "ts-loader"
        }
      ]
    }
  },
  {
    name: "webview",
    target: "web",
    mode: "none",
    entry: "./webview-ui/main.tsx",
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "webview.js"
    },
    resolve: {
      extensions: [".ts", ".tsx", ".js"]
    },
    module: {
      rules: [
        {
          test: /\.(ts|tsx)$/,
          exclude: /node_modules/,
          use: "ts-loader"
        },
        {
          test: /\.css$/,
          use: ["style-loader", "css-loader"]
        }
      ]
    }
  }
];
