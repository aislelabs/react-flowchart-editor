const path = require("path");
const webpack = require("webpack");

module.exports = {
  entry: {"index": "./indexsrc.js"},
  mode: "development",
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /(node_modules|bower_components)/,
        loader: "babel-loader",
        options: { 
	          presets: [
                        ['@babel/env', {modules: "false"}],
                        '@babel/react'
                    ],
                    plugins: [
                        '@babel/plugin-proposal-class-properties',
			'@babel/plugin-transform-modules-commonjs'
                    ]
           }
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"]
      }
    ]
  },
  resolve: { extensions: ["*", ".js", ".jsx"] },
  output: {
    path: path.resolve(__dirname, "./"),
    filename: "[name].js"
  }
}

