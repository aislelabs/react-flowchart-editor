const path = require("path");
const webpack = require("webpack");

module.exports = {
  entry: {"index": "./indexsrc.js"},
//  entry: {"demoindex": './src/demo/index.js'}, // build demo page index
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
			"@babel/plugin-transform-modules-commonjs", // remove for demoindex.js
                        '@babel/plugin-proposal-class-properties'
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
    filename: "[name].js",
    libraryTarget: 'commonjs2' // remove for demoindex.js
  }
}

