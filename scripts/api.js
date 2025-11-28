#!/usr/bin/env node

/**
 * Manage the Python detection API.
 *
 *   node scripts/api.js setup   create backend/.venv, install requirements and the spaCy model
 *   node scripts/api.js start   run the FastAPI server over HTTPS on port 8100
 *   node scripts/api.js test    run the backend test suite
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BACKEND = path.join(ROOT, 'backend');
const VENV = path.join(BACKEND, '.venv');
const VENV_PYTHON = process.platform === 'win32'
  ? path.join(VENV, 'Scripts', 'python.exe')
  : path.join(VENV, 'bin', 'python');
const API_PORT = process.env.API_PORT || '8100';
const SPACY_MODEL = process.env.SPACY_MODEL || 'en_core_web_lg';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: BACKEND, ...options });
  if (result.error) {
    console.error(`✗ Could not run ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function requireVenv() {
  if (!fs.existsSync(VENV_PYTHON)) {
    console.error('✗ Python environment not found. Run `npm run setup:api` first.');
    process.exit(1);
  }
}

function setup() {
  if (!fs.existsSync(VENV_PYTHON)) {
    // spaCy needs Python 3.9-3.12; on Windows prefer the launcher's 3.11 if it is installed
    const python = process.env.PYTHON || (process.platform === 'win32' ? 'py' : 'python3');
    const args = python === 'py' ? ['-3.11', '-m', 'venv', VENV] : ['-m', 'venv', VENV];
    run(python, args);
  }
  run(VENV_PYTHON, ['-m', 'pip', 'install', '--upgrade', 'pip']);
  run(VENV_PYTHON, ['-m', 'pip', 'install', '-r', 'requirements.txt']);
  run(VENV_PYTHON, ['-m', 'spacy', 'download', SPACY_MODEL]);
  console.log('✓ Python API ready');
}

function start() {
  requireVenv();
  run(VENV_PYTHON, [
    '-m', 'uvicorn', 'app.main:app',
    '--host', '127.0.0.1',
    '--port', API_PORT,
    '--ssl-certfile', path.join(ROOT, 'cert.pem'),
    '--ssl-keyfile', path.join(ROOT, 'key.pem'),
  ]);
}

function test() {
  requireVenv();
  run(VENV_PYTHON, ['-m', 'pytest', '-q', ...process.argv.slice(3)]);
}

const commands = { setup, start, test };
const command = commands[process.argv[2]];
if (!command) {
  console.error('Usage: node scripts/api.js <setup|start|test>');
  process.exit(1);
}
command();
