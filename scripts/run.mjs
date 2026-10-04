// 複数のプロセスをまとめて起動し、ログに名前を付けて流す。どれかが終了したら全部止める
//   node scripts/run.mjs local : 画像生成サーバ（image-server/）＋ アプリ
//   node scripts/run.mjs dev   : アプリ（変更で自動再起動）＋ 画面の開発サーバ（Vite、http://localhost:5173）
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const procs = [];

function run(name, color, cmd, args, opts = {}) {
  const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32", ...opts });
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = "";
    stream.on("data", (d) => {
      buf += d;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const line of lines) out.write(prefix + line + "\n");
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code) => {
    console.log(`${prefix}終了しました (code ${code})`);
    shutdown();
  });
  procs.push(child);
}

function shutdown() {
  for (const p of procs) if (p.exitCode === null) p.kill();
  setTimeout(() => process.exit(0), 500);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const node = (args) => [process.execPath, ["--env-file-if-exists=.env", ...args], { shell: false }];

function imageServer() {
  // uv sync 済みの仮想環境があればそれを直接使い、なければ uv run に任せる
  const venvPython = path.resolve("image-server", process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python");
  if (existsSync(venvPython)) run("image", "35", venvPython, ["server.py"], { cwd: "image-server", shell: false });
  else run("image", "35", "uv", ["run", "server.py"], { cwd: "image-server" });
}

const mode = process.argv[2];
if (mode === "local") {
  imageServer();
  run("app", "36", ...node(["src/server/index.ts"]));
} else if (mode === "dev") {
  run("app", "36", ...node(["--watch", "src/server/index.ts", ...process.argv.slice(3)]));
  run("vite", "33", "npx", ["vite"]);
} else {
  console.error("使い方: node scripts/run.mjs <local|dev>");
  process.exit(1);
}
