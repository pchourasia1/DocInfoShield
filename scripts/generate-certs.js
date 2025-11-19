#!/usr/bin/env node

/**
 * Set up trusted SSL certificates for local development.
 * Uses office-addin-dev-certs to create a locally trusted CA and localhost certificate,
 * then copies them to cert.pem / key.pem. Both the task pane server (http-server)
 * and the Python API (uvicorn) use these files.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const certPath = path.join(__dirname, '..', 'cert.pem');
const keyPath = path.join(__dirname, '..', 'key.pem');

const devCertsDir = path.join(os.homedir(), '.office-addin-dev-certs');
const devCertPath = path.join(devCertsDir, 'localhost.crt');
const devKeyPath = path.join(devCertsDir, 'localhost.key');

try {
  // Installs and trusts the dev certificates if missing or expired; no-op otherwise
  execSync('npx office-addin-dev-certs install', { stdio: 'inherit' });

  fs.copyFileSync(devCertPath, certPath);
  fs.copyFileSync(devKeyPath, keyPath);
  console.log('✓ Trusted SSL certificates ready');
} catch (error) {
  console.error('✗ Error setting up SSL certificates:', error.message);
  process.exit(1);
}
