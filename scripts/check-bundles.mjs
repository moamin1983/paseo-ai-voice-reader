// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

import { build } from "esbuild";
import { resolve, relative } from "node:path";
import { mkdir, writeFile, readFile } from "node:fs/promises";
const host = [
  "@getpaseo/plugin",
  "@getpaseo/plugin/client",
  "@getpaseo/plugin/client/ui",
  "@getpaseo/plugin/client/react-native",
  "react",
  "react/jsx-runtime",
  "react-native",
  "@tanstack/react-query",
  "zod",
];
const root = process.cwd();
for (const runtime of ["client", "server"]) {
  const result = await build({
    entryPoints: [`index.${runtime}.${runtime === "client" ? "tsx" : "ts"}`],
    bundle: true,
    platform: runtime === "client" ? "neutral" : "node",
    format: "esm",
    target: "es2020",
    write: false,
    metafile: true,
    external:
      runtime === "client"
        ? host
        : ["@getpaseo/plugin", "@getpaseo/plugin/server", "zod"],
    plugins: [
      {
        name: "paseo-runtime-boundaries",
        setup(b) {
          b.onResolve({ filter: /.*/ }, (args) => {
            if (!args.importer) return;
            const importer = relative(root, args.importer);
            if (args.path === "@getpaseo/plugin/client/host")
              throw new Error("Private Paseo host imports are forbidden.");
            if (runtime === "client" && args.path.startsWith("node:"))
              throw new Error("Node imports in client bundle.");
            if (args.path.startsWith(".")) {
              const target = relative(
                root,
                resolve(args.resolveDir, args.path),
              );
              if (!/^(client|server|shared)\//.test(target))
                throw new Error(`Code outside runtime folders: ${target}`);
              if (runtime === "client" && target.startsWith("server/"))
                throw new Error("Server module in client.");
              if (runtime === "server" && target.startsWith("client/"))
                throw new Error("Client module in server.");
              if (
                importer.startsWith("shared/") &&
                !target.startsWith("shared/")
              )
                throw new Error("Shared module crosses runtime boundary.");
            }
          });
        },
      },
    ],
  });
  await mkdir("evidence", { recursive: true });
  await writeFile(
    `evidence/${runtime}-bundle.js`,
    result.outputFiles[0].contents,
  );
  await writeFile(
    `evidence/${runtime}-bundle-inputs.json`,
    JSON.stringify(Object.keys(result.metafile.inputs), null, 2) + "\n",
  );
  console.log(
    `${runtime}: bundle built; runtime imports and file boundaries checked (${result.outputFiles[0].contents.length} bytes).`,
  );
}
for (const file of ["reader.tsx", "settings.tsx", "runtime.ts", "queue.ts", "timeline.tsx", "voice-ui.tsx", "rail.tsx"]) {
  const text = await readFile(`client/${file}`, "utf8");
  if (
    /(?<![.\w])(?:document|window|navigator)\.|localStorage|<(?:div|span|button|input|audio|section|p)[ >]|className=|onClick=/.test(
      text,
    )
  )
    throw new Error(`Non-native UI API: ${file}`);
}
console.log("Native UI audit passed; no DOM/browser audio dependencies.");
