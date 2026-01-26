#!/bin/bash

echo "Building frontend..."
cd client
npm install
npm run build

echo "Installing server dependencies..."
cd ../server
npm install

echo "Build complete!"
