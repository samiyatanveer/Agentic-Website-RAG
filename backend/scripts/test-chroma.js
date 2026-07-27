/**
 * test-chroma.js
 * Verify ChromaDB is running and accessible.
 * Run: node scripts/test-chroma.js
 */

import { checkChromaHealth } from '../src/config/chroma.js';
import env from '../src/config/env.js';

async function test() {
  console.log(`🔍 Checking ChromaDB at ${env.CHROMADB_HOST}:${env.CHROMADB_PORT}...\n`);

  const result = await checkChromaHealth();

  if (!result.healthy) {
    console.error('❌ ChromaDB is NOT running');
    console.error(`   ${result.error}`);
    console.error('\n💡 Fix: Run "chroma run --path ./data/chroma" in a terminal');
    process.exit(1);
  }

  console.log('✅ ChromaDB is running');
  console.log(`📋 Status: ${result.version}`);
  process.exit(0);
}

test();
