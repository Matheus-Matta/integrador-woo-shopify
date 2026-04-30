require('dotenv').config();
const { spawnSync } = require('child_process');

// Roda o tsx apontando pro config.ts, o que forçará a avaliação
const result = spawnSync('npx', ['tsx', 'lib/config.ts'], { stdio: 'inherit', env: process.env, shell: true });
console.log('Script exit code:', result.status);
