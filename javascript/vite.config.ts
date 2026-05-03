import { defineConfig } from "vite";
import { resolve } from 'node:path'
import { readdirSync } from 'node:fs'
import babel from "@rolldown/plugin-babel"

// In 2026 we will not use experimental decorators. For some wild reason vite doesn't support this
// out of the box yet.
// TypeScript's decorator documentation: https://devblogs.microsoft.com/typescript/announcing-typescript-5-0/#decorators
// We will ignore emit size since one day browsers will natively support this syntax: https://github.com/microsoft/TypeScript/issues/55688
function standardDecoratorPlugin() {
    return babel({
        presets: [
            {
                preset: () => ({
                    plugins: [["@babel/plugin-proposal-decorators", { version: "2023-11" }]]
                }),
                rolldown: {
                    // This runs a regex to only apply the babel plugin on source files containing
                    // an "@" character. This is obviously a very leaky check but it works.
                    filter: { code: "@" },
                }
            }
        ]
    })
}

// Automatically pick up any `.entry.ts` files within the `./install` directory and make them
// entries to be built.
const installDir = resolve(import.meta.dirname, './src')
const input = Object.fromEntries(
    readdirSync(installDir)
        .filter(f => f.endsWith('.entry.ts'))
        .map(f => [f.replace('.entry.ts', ''), resolve(installDir, f)])
)

export default defineConfig({
    // The asset directory within the `mdbook`.
    base: '/js/',
    plugins: [standardDecoratorPlugin()],
    build: {
        outDir: "../book-src/js",
        emptyOutDir: true,
        rolldownOptions: {
            input,
            output: {
                entryFileNames: '[name].js',
                assetFileNames: 'assets/[name].[ext]',
            }
        }
    }
})
