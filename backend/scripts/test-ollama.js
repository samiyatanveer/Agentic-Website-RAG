/**
 * test-ollama.js
 * Verify Ollama is running and the required model is available.
 * Run: node scripts/test-ollama.js
 */

import { checkOllamaHealth } from '../src/config/ollama.js';
import env from '../src/config/env.js';

async function test() {
  console.log(`🔍 Checking Ollama at ${env.OLLAMA_BASE_URL}...\n`);

  const result = await checkOllamaHealth();

  if (!result.healthy) {
    console.error('❌ Ollama is NOT running');
    console.error(`   ${result.error}`);
    console.error('\n💡 Fix: Run "ollama serve" in a terminal');
    process.exit(1);
  }

  console.log('✅ Ollama is running');
  console.log(`📋 Available models: ${result.models.join(', ') || '(none)'}`);

  if (!result.modelAvailable) {
    console.warn(`\n⚠️  Required model "${env.OLLAMA_MODEL}" is NOT available`);
    console.warn(`   Run: ollama pull ${env.OLLAMA_MODEL}`);
  } else {
    console.log(`✅ Required model "${env.OLLAMA_MODEL}" is available`);
  }

  process.exit(0);
}

test();
