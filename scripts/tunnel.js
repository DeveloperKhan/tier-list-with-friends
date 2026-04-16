#!/usr/bin/env node
/**
 * Wraps `cloudflared tunnel --url http://localhost:5173`.
 *
 * When cloudflared assigns a trycloudflare.com URL, it is printed clearly
 * so you can paste it into the Discord Developer Portal (OAuth2 redirects
 * + Activities URL mappings).
 *
 * The Worker emulator talks directly to http://localhost:3001 (via .dev.vars)
 * so the tunnel URL does NOT need to be written anywhere in the code.
 *
 * Usage: node scripts/tunnel.js
 */

import { spawn } from 'child_process';

const TUNNEL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

const proc = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:5173'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

let announced = false;

function onData(chunk) {
  const text = chunk.toString();
  process.stderr.write(text);

  if (!announced) {
    const m = text.match(TUNNEL_RE);
    if (m) {
      announced = true;
      const url = m[0];
      process.stderr.write(`
╔══════════════════════════════════════════════════════════════╗
║  Tunnel ready!                                               ║
║  ${url.padEnd(60)}║
║                                                              ║
║  Paste into Discord Developer Portal:                        ║
║    OAuth2 → Redirects                                        ║
║    Activities → URL Mappings (Root Mapping target)           ║
╚══════════════════════════════════════════════════════════════╝\n`);
    }
  }
}

proc.stdout.on('data', onData);
proc.stderr.on('data', onData);
proc.on('exit', (code) => process.exit(code ?? 0));

process.on('SIGINT',  () => proc.kill('SIGINT'));
process.on('SIGTERM', () => proc.kill('SIGTERM'));
