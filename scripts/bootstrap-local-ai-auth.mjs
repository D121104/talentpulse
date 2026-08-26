import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const force = process.argv.includes('--force');
const secretsDir = resolve(process.cwd(), '.secrets');
const privatePath = resolve(secretsDir, 'ai-service-dev-private.pem');
const publicPath = resolve(secretsDir, 'ai-service-dev-public.pem');

if (!force && (existsSync(privatePath) || existsSync(publicPath))) {
  console.error('Refusing to overwrite an existing .secrets key pair. Use --force only to replace it.');
  process.exit(1);
}

mkdirSync(secretsDir, { recursive: true, mode: 0o700 });
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
writeFileSync(privatePath, privateKey, { encoding: 'utf8', mode: 0o600 });
writeFileSync(publicPath, publicKey, { encoding: 'utf8', mode: 0o644 });
console.log(`Generated local AI service key pair in ${secretsDir}`);
console.log(`Nest private key: ${privatePath}`);
console.log(`AI public key: ${publicPath}`);
console.log('The .secrets directory is ignored by Git; never commit these files.');
