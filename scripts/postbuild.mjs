import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const distDir = resolve(process.cwd(), "dist");
const styleFile = resolve(distDir, "styles.css");
const esmFile = resolve(distDir, "index.js");
const cjsFile = resolve(distDir, "index.cjs");
const marker = "lava-form-builder-styles";

const cssText = await readFile(styleFile, "utf8");

function createInjector() {
  const cssLiteral = JSON.stringify(cssText);
  return `const __lavaFormBuilderCss = ${cssLiteral};
(function injectLavaFormBuilderStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("${marker}")) return;
  const styleElement = document.createElement("style");
  styleElement.id = "${marker}";
  styleElement.setAttribute("data-lava-form-builder", "true");
  styleElement.textContent = __lavaFormBuilderCss;
  if (document.head) {
    document.head.appendChild(styleElement);
    return;
  }
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      if (!document.getElementById("${marker}")) {
        document.head?.appendChild(styleElement);
      }
    },
    { once: true },
  );
})();
`;
}

async function prependInjector(filePath) {
  const original = await readFile(filePath, "utf8");
  if (original.includes(marker)) {
    return;
  }
  await writeFile(filePath, `${createInjector()}${original}`);
}

await prependInjector(esmFile);
await prependInjector(cjsFile);
