const { spawn } = require("child_process");
const net = require("net");
const path = require("path");

const root = __dirname ? path.resolve(__dirname, "..") : process.cwd();
const isWindows = process.platform === "win32";

const processes = [
  {
    name: "user-service",
    cwd: path.join(root, "microservices", "user-service"),
    commandLine: "npm run start:dev",
    port: 3000,
  },
  {
    name: "event-service",
    cwd: path.join(root, "microservices", "event-service"),
    commandLine: "npm run start:dev",
    port: 3001,
  },
  {
    name: "ticketing-service",
    cwd: path.join(root, "microservices", "ticketing-service"),
    commandLine: "npm run start:dev",
    port: 3002,
  },
  {
    name: "notification-service",
    cwd: path.join(root, "microservices", "notification-service"),
    commandLine: "npm run start:dev",
    port: 3003,
  },
  {
    name: "credential-service",
    cwd: path.join(root, "microservices", "credential-service"),
    commandLine: "npm run start:dev",
    port: 3004,
  },
  {
    name: "agenda-service",
    cwd: path.join(root, "microservices", "agenda-service"),
    commandLine: "npm run start:dev",
    port: 3005,
  },
  {
    name: "analytics-service",
    cwd: path.join(root, "microservices", "analytics-service"),
    commandLine: "npm run start:dev",
    port: 3006,
  },
  {
    name: "mobile-api-service",
    cwd: path.join(root, "microservices", "mobile-api-service"),
    commandLine: "npm run start:dev",
    port: 3007,
  },
  {
    name: "api-gateway",
    cwd: path.join(root, "microservices", "api-gateway"),
    commandLine: "npm run start:dev",
    port: 3008,
  },
];

const children = [];
let stopping = false;

function pipeOutput(child, name) {
  child.stdout.on("data", function (chunk) {
    process.stdout.write(`[${name}] ${chunk}`);
  });

  child.stderr.on("data", function (chunk) {
    process.stderr.write(`[${name}] ${chunk}`);
  });
}

function isPortBusy(port) {
  return new Promise(function (resolve) {
    const socket = net.createConnection({ host: "127.0.0.1", port: port });

    socket.once("connect", function () {
      socket.destroy();
      resolve(true);
    });

    socket.once("error", function () {
      resolve(false);
    });
  });
}

function buildSpawnOptions(target) {
  if (isWindows) {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", target.commandLine],
    };
  }

  return {
    command: "sh",
    args: ["-lc", target.commandLine],
  };
}

function stopAll(exitCode) {
  if (stopping) {
    return;
  }

  stopping = true;

  children.forEach(function (child) {
    if (!child.killed) {
      child.kill();
    }
  });

  setTimeout(function () {
    process.exit(exitCode);
  }, 300);
}

async function startAll() {
  for (const target of processes) {
    if (target.port && (await isPortBusy(target.port))) {
      process.stdout.write(`[${target.name}] ya esta escuchando en localhost:${target.port}, se omite el arranque.\n`);
      continue;
    }

    const spawnOptions = buildSpawnOptions(target);
    const child = spawn(spawnOptions.command, spawnOptions.args, {
      cwd: target.cwd,
      shell: false,
      env: process.env,
    });

    children.push(child);
    pipeOutput(child, target.name);

    child.on("exit", function (code) {
      if (stopping) {
        return;
      }

      if (code && code !== 0) {
        console.error(`[${target.name}] termino con codigo ${code}`);
        stopAll(code);
      }
    });
  }
}

startAll().catch(function (error) {
  console.error(error instanceof Error ? error.message : String(error));
  stopAll(1);
});

process.on("SIGINT", function () {
  stopAll(0);
});

process.on("SIGTERM", function () {
  stopAll(0);
});