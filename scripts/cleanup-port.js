#!/usr/bin/env node

/**
 * Free the task pane (3100) and API (8100) ports so `npm start` begins cleanly.
 * Works on Windows (netstat/taskkill) and macOS/Linux (lsof/kill).
 */

const { execSync } = require('child_process');

const PORTS = [3100, 8100];

function pidsOnPort(port) {
  try {
    if (process.platform === 'win32') {
      const output = execSync(`netstat -ano`, { encoding: 'utf8' });
      const pids = output
        .split(/\r?\n/)
        .map(line => line.trim().split(/\s+/))
        .filter(cols => cols.length >= 5 && cols[1].endsWith(`:${port}`) && cols[3] === 'LISTENING')
        .map(cols => cols[4]);
      return [...new Set(pids)].filter(pid => pid !== '0');
    }
    const output = execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    return output.split('\n').map(pid => pid.trim()).filter(Boolean);
  } catch {
    return []; // lsof exits with status 1 when nothing is listening
  }
}

for (const port of PORTS) {
  const pids = pidsOnPort(port);
  if (pids.length === 0) {
    console.log(`✓ Port ${port} is free`);
    continue;
  }
  for (const pid of pids) {
    try {
      const command = process.platform === 'win32' ? `taskkill /PID ${pid} /F` : `kill ${pid}`;
      execSync(command, { stdio: 'ignore' });
      console.log(`✓ Stopped process ${pid} on port ${port}`);
    } catch {
      console.log(`Note: could not stop process ${pid} on port ${port}; stop it manually`);
    }
  }
}
