"use strict";

// Script: Index the codebase and generate code-index.json
// Collects basic metadata and exported symbols for .ts, .tsx, .js, .jsx, .mjs, .cjs files.

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

function getProjectRoot() {
  // scripts/ is directly under the project root
  return path.resolve(__dirname, "..");
}

function normalizePath(p) {
  return p.split(path.sep).join("/");
}

function shouldSkipDir(dirName) {
  const excluded = new Set([
    "node_modules",
    ".git",
    ".next",
    ".turbo",
    "dist",
    "build",
    "out",
    "coverage",
    ".cursor",
    ".vscode",
    "public" // static assets can be large and not useful for code index
  ]);
  return excluded.has(dirName);
}

function isCodeFile(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  return [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext);
}

function getScriptKindForFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".ts":
      return ts.ScriptKind.TS;
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".js":
    case ".mjs":
    case ".cjs":
      return ts.ScriptKind.JS;
    case ".jsx":
      return ts.ScriptKind.JSX;
    default:
      return ts.ScriptKind.Unknown;
  }
}

function hasExportModifier(node) {
  const mods = node.modifiers;
  if (!mods) return false;
  return mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

function hasDefaultModifier(node) {
  const mods = node.modifiers;
  if (!mods) return false;
  return mods.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
}

function collectExportsFromSource(sourceFile) {
  const named = new Set();
  const types = new Set(); // interfaces, types, enums, classes
  const reexports = [];
  const exportStars = [];
  let hasDefault = false;

  function addName(name) {
    if (name && typeof name === "string") named.add(name);
  }

  function visit(node) {
    if (ts.isExportAssignment(node)) {
      // export default expr
      hasDefault = true;
    } else if (ts.isFunctionDeclaration(node) && hasExportModifier(node)) {
      if (hasDefaultModifier(node)) {
        hasDefault = true;
      } else if (node.name && node.name.text) {
        addName(node.name.text);
      }
    } else if (ts.isClassDeclaration(node) && hasExportModifier(node)) {
      if (hasDefaultModifier(node)) {
        hasDefault = true;
      } else if (node.name && node.name.text) {
        addName(node.name.text);
        types.add(node.name.text);
      }
    } else if (ts.isInterfaceDeclaration(node) && hasExportModifier(node)) {
      addName(node.name.text);
      types.add(node.name.text);
    } else if (ts.isTypeAliasDeclaration(node) && hasExportModifier(node)) {
      addName(node.name.text);
      types.add(node.name.text);
    } else if (ts.isEnumDeclaration(node) && hasExportModifier(node)) {
      addName(node.name.text);
      types.add(node.name.text);
    } else if (ts.isVariableStatement(node) && hasExportModifier(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) addName(decl.name.text);
        else if (ts.isObjectBindingPattern(decl.name)) {
          for (const el of decl.name.elements) {
            if (ts.isIdentifier(el.name)) addName(el.name.text);
          }
        } else if (ts.isArrayBindingPattern(decl.name)) {
          for (const el of decl.name.elements) {
            if (ts.isIdentifier(el.name)) addName(el.name.text);
          }
        }
      }
    } else if (ts.isExportDeclaration(node)) {
      const from = node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
        ? node.moduleSpecifier.text
        : undefined;

      if (!node.exportClause) {
        // export * from 'module'
        if (from) exportStars.push(from);
      } else if (ts.isNamedExports(node.exportClause)) {
        const exported = [];
        for (const spec of node.exportClause.elements) {
          const outName = spec.name?.text;
          const inName = spec.propertyName?.text || outName;
          // Prefer exported name (alias) for index
          if (outName) exported.push(outName);
          if (inName && !outName) exported.push(inName);
        }
        if (exported.length > 0) {
          for (const n of exported) named.add(n);
          reexports.push({ from, names: exported });
        }
      } else if (ts.isNamespaceExport(node.exportClause)) {
        // export * as ns from 'module'
        const ns = node.exportClause.name?.text;
        if (ns) {
          named.add(ns);
          reexports.push({ from, names: [ns] });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return {
    named: Array.from(named).sort(),
    types: Array.from(types).sort(),
    hasDefault,
    reexports,
    exportStars
  };
}

function scanForFiles(rootDir) {
  const files = [];

  /** @param {string} dir */
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (shouldSkipDir(entry.name)) continue;
        walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        if (!isCodeFile(entry.name)) continue;
        files.push(path.join(dir, entry.name));
      }
    }
  }

  walk(rootDir);
  return files;
}

function indexFile(filePath, projectRoot) {
  const absPath = filePath;
  let content;
  try {
    content = fs.readFileSync(absPath, "utf8");
  } catch {
    return null;
  }

  const rel = normalizePath(path.relative(projectRoot, absPath));
  const size = Buffer.byteLength(content, "utf8");
  const lines = content.split(/\r?\n/).length;
  const ext = path.extname(filePath).toLowerCase();

  let exportsInfo = {
    named: [],
    types: [],
    hasDefault: false,
    reexports: [],
    exportStars: []
  };

  try {
    const source = ts.createSourceFile(
      rel,
      content,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      getScriptKindForFile(filePath)
    );
    exportsInfo = collectExportsFromSource(source);
  } catch {
    // Parsing failed; keep exportsInfo empty
  }

  return {
    path: rel,
    ext,
    size,
    lines,
    exports: exportsInfo
  };
}

function summarize(files) {
  const byExt = {};
  for (const f of files) {
    byExt[f.ext] = (byExt[f.ext] || 0) + 1;
  }
  return byExt;
}

function main() {
  const startedAt = Date.now();
  const projectRoot = getProjectRoot();
  const allFiles = scanForFiles(projectRoot);
  const indexed = [];

  for (const fp of allFiles) {
    const info = indexFile(fp, projectRoot);
    if (info) indexed.push(info);
  }

  const index = {
    version: 1,
    generatedAt: new Date().toISOString(),
    projectRoot: normalizePath(projectRoot),
    filesCount: indexed.length,
    byExtension: summarize(indexed),
    files: indexed
  };

  const outPath = path.join(projectRoot, "code-index.json");
  fs.writeFileSync(outPath, JSON.stringify(index, null, 2), "utf8");
  const elapsedMs = Date.now() - startedAt;
  console.log(`Indexed ${indexed.length} files in ${elapsedMs}ms → ${normalizePath(outPath)}`);
}

if (require.main === module) {
  main();
}


