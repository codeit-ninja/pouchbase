// Downloads the PocketBase binary pinned in package.json (once) into ./bin and
// runs it with the given arguments, using the local pb_data, pb_migrations and pb_hooks.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).pocketbase;

const os = { darwin: 'darwin', linux: 'linux', win32: 'windows' }[process.platform];
const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch];
if (!os || !arch) {
	console.error(`PocketBase heeft geen build voor ${process.platform}/${process.arch}`);
	process.exit(1);
}

const binDir = join(root, 'bin');
const exe = join(binDir, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase');
const versionFile = join(binDir, '.version');

async function ensureBinary() {
	if (existsSync(exe) && existsSync(versionFile) && readFileSync(versionFile, 'utf8') === version) return;

	const url = `https://github.com/pocketbase/pocketbase/releases/download/v${version}/pocketbase_${version}_${os}_${arch}.zip`;
	console.log(`PocketBase v${version} downloaden: ${url}`);
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Download mislukt (${res.status}) voor ${url}`);

	rmSync(binDir, { recursive: true, force: true });
	mkdirSync(binDir, { recursive: true });
	const zip = join(binDir, 'pocketbase.zip');
	writeFileSync(zip, Buffer.from(await res.arrayBuffer()));

	// bsdtar (macOS, Windows 10+) reads zip files; most Linux distros need unzip.
	try {
		execFileSync('tar', ['-xf', zip, '-C', binDir], { stdio: 'ignore' });
	} catch {
		execFileSync('unzip', ['-o', zip, '-d', binDir], { stdio: 'ignore' });
	}
	rmSync(zip);
	if (process.platform !== 'win32') chmodSync(exe, 0o755);
	writeFileSync(versionFile, version);
}

await ensureBinary();

const args = process.argv.slice(2);
if (args[0] === '--setup-only') process.exit(0);

const dirs = [
	`--dir=${join(root, 'pb_data')}`,
	`--migrationsDir=${join(root, 'pb_migrations')}`,
	`--hooksDir=${join(root, 'pb_hooks')}`
];
const child = spawn(exe, [...args, ...(args.length ? dirs : [])], { stdio: 'inherit', cwd: root });
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
