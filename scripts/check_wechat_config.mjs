// Report only tracked filenames. Never print a matched value or read .env.local.
import { execFileSync, spawnSync } from 'node:child_process';

const privateFiles = execFileSync('git', ['ls-files', '--', '.env.local', 'scripts/local-config.json'], { encoding: 'utf8' }).trim();
if (privateFiles) {
  console.error('Remove local configuration files from the Git index:\n' + privateFiles);
  process.exit(1);
}

const patterns = [
  'wx[[:xdigit:]]{16}([^[:xdigit:]]|$)',
  'cloud[0-9]+-[[:alnum:]]{8,}',
  `WECHAT_APPSECRET['"]?[[:space:]]*[:=][[:space:]]*['"]?[[:xdigit:]]{32}`,
];
const args = ['grep', '--cached', '-IilE', ...patterns.flatMap(pattern => ['-e', pattern]), '--'];
const result = spawnSync('git', args, { encoding: 'utf8' });
if (result.status === 0) {
  console.error('Remove literal WeChat identifiers or credentials from these tracked files:\n' + result.stdout.trim());
  process.exit(1);
}
if (result.status !== 1) throw result.error || new Error('Could not inspect the Git index');
console.log('PASS tracked files contain no matching WeChat configuration literals');
