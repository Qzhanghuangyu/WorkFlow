import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** 从简单 YAML 中读取 schema；本实现只解析状态计算所需字段。 */
function parseSchema(content, source) {
  const schema = { name: '', artifacts: [], apply: {} };
  let artifact;
  let section = '';
  let listTarget;
  const lines = content.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.replace(/\s+#.*$/, '');
    if (!line.trim()) continue;
    const indent = line.search(/\S/);
    const text = line.trim();
    if (text === 'artifacts:') { section = 'artifacts'; listTarget = undefined; continue; }
    if (text === 'apply:') { section = 'apply'; listTarget = undefined; continue; }

    const artifactMatch = line.match(/^\s{2}-\s+id:\s*(.+)$/);
    if (section === 'artifacts' && artifactMatch) {
      artifact = { id: unquote(artifactMatch[1]), requires: [] };
      schema.artifacts.push(artifact);
      listTarget = undefined;
      continue;
    }

    const listItem = text.match(/^-\s+(.+)$/);
    if (listItem && listTarget) {
      listTarget.push(unquote(listItem[1]));
      continue;
    }

    const field = text.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!field) continue;
    const [, key, rawValue] = field;
    let value = unquote(rawValue);
    if (key === 'name' && section !== 'apply' && !artifact) {
      schema.name = value;
      continue;
    }
    const target = section === 'apply' ? schema.apply : artifact;
    if (!target) continue;

    // YAML 的 | 表示保留换行的多行文本，用于 template 与 instruction。
    if (rawValue === '|') {
      const blockIndent = indent;
      const block = [];
      let contentIndent;
      while (index + 1 < lines.length) {
        const candidate = lines[index + 1];
        if (candidate.trim() && candidate.search(/\S/) <= blockIndent) break;
        index += 1;
        if (!candidate.trim()) {
          block.push('');
          continue;
        }
        contentIndent ??= candidate.search(/\S/);
        block.push(candidate.slice(contentIndent));
      }
      value = `${block.join('\n')}\n`;
    }

    if (key === 'requires') {
      target.requires = parseInlineList(value);
      listTarget = value ? undefined : target.requires;
    } else if (key === 'name' && section !== 'apply') {
      schema.name = value;
    } else if (key === 'generates' || key === 'tracks' || key === 'template' || key === 'instruction') {
      target[key] = value;
      listTarget = undefined;
    }
    // `indent` keeps this parser intentionally compatible with the OpenSpec
    // schema layout, while ignoring template/instruction multi-line blocks.
    void indent;
  }

  if (!schema.name || schema.artifacts.length === 0) {
    throw new Error(`Schema 无效：${source} 必须包含 name 和 artifacts`);
  }
  const ids = new Set(schema.artifacts.map((item) => item.id));
  for (const item of schema.artifacts) {
    if (!item.id || !item.generates) throw new Error(`Schema 无效：artifact 必须包含 id 和 generates（${source}）`);
    for (const dependency of item.requires) {
      if (!ids.has(dependency)) throw new Error(`Schema 无效：${item.id} 依赖不存在的 artifact ${dependency}`);
    }
  }
  return schema;
}

function unquote(value) {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

function parseInlineList(value) {
  if (!value || value === '[]') return [];
  if (value.startsWith('[') && value.endsWith(']')) {
    return value.slice(1, -1).split(',').map((item) => unquote(item)).filter(Boolean);
  }
  return [value];
}

/** schema 优先级与 OpenSpec 一致：change metadata → 项目配置 → 默认值。 */
export function resolveSchemaName(root, changeDir) {
  const metadata = readSchemaField(path.join(changeDir, '.openspec.yaml'));
  const config = readSchemaField(path.join(root, 'cwfspec', 'config.yaml'))
    ?? readSchemaField(path.join(root, 'cwfspec', 'config.yml'));
  return metadata ?? config ?? 'spec-driven';
}

function readSchemaField(file) {
  if (!existsSync(file)) return undefined;
  const match = readFileSync(file, 'utf8').match(/^schema:\s*["']?([^\s"']+)["']?\s*$/m);
  return match?.[1];
}

export function loadSchema(root, changeDir) {
  const schemaName = resolveSchemaName(root, changeDir);
  const candidates = [
    path.join(root, 'cwfspec', 'schemas', schemaName, 'schema.yaml'),
    path.join(PACKAGE_ROOT, 'schemas', schemaName, 'schema.yaml'),
  ];
  const schemaPath = candidates.find((candidate) => existsSync(candidate));
  if (!schemaPath) throw new Error(`找不到 schema '${schemaName}'。已查找：${candidates.join('、')}`);
  return { schemaName, schema: parseSchema(readFileSync(schemaPath, 'utf8'), schemaPath), schemaPath };
}

function walkFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(fullPath) : entry.isFile() ? [fullPath] : [];
  });
}

/** 将 schema 的 generates 规则解析为当前实际存在的文件。 */
export function resolveArtifactOutputs(changeDir, generates) {
  if (!/[?*[]/.test(generates)) {
    const output = path.join(changeDir, generates);
    return existsSync(output) && statSync(output).isFile() ? [output] : [];
  }
  const pattern = new RegExp(`^${generates
    .replace(/[.+^${}()|\\]/g, '\\$&')
    .replace(/\*\*\//g, '@@GLOBSTAR@@')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/@@GLOBSTAR@@/g, '(?:.*/)?')}$`);
  return walkFiles(changeDir)
    .filter((file) => pattern.test(path.relative(changeDir, file).split(path.sep).join('/')))
    .sort();
}

function getBuildOrder(artifacts) {
  const degrees = new Map(artifacts.map((item) => [item.id, item.requires.length]));
  const dependents = new Map(artifacts.map((item) => [item.id, []]));
  for (const item of artifacts) for (const dependency of item.requires) dependents.get(dependency).push(item.id);
  const queue = artifacts.map((item) => item.id).filter((id) => degrees.get(id) === 0).sort();
  const ordered = [];
  while (queue.length) {
    const id = queue.shift();
    ordered.push(id);
    const ready = [];
    for (const dependent of dependents.get(id)) {
      degrees.set(dependent, degrees.get(dependent) - 1);
      if (degrees.get(dependent) === 0) ready.push(dependent);
    }
    queue.push(...ready.sort());
  }
  if (ordered.length !== artifacts.length) throw new Error('Schema 无效：artifact 依赖存在循环');
  return ordered;
}

/** 生成与 OpenSpec status 对齐的 artifact 状态、依赖和输出路径。 */
export function getChangeStatus(root, changeName) {
  const changeDir = path.join(root, 'cwfspec', 'changes', changeName);
  if (!existsSync(changeDir)) throw new Error(`变更 '${changeName}' 不存在：${changeDir}`);
  const { schemaName, schema, schemaPath } = loadSchema(root, changeDir);
  const completed = new Set(schema.artifacts
    .filter((artifact) => resolveArtifactOutputs(changeDir, artifact.generates).length > 0)
    .map((artifact) => artifact.id));
  const buildOrder = getBuildOrder(schema.artifacts);
  const artifactPaths = {};
  const artifacts = schema.artifacts.map((artifact) => {
    const existingOutputPaths = resolveArtifactOutputs(changeDir, artifact.generates);
    artifactPaths[artifact.id] = {
      outputPath: artifact.generates,
      resolvedOutputPath: path.join(changeDir, artifact.generates),
      existingOutputPaths,
    };
    const missingDeps = artifact.requires.filter((id) => !completed.has(id));
    return {
      id: artifact.id,
      outputPath: artifact.generates,
      status: completed.has(artifact.id) ? 'done' : missingDeps.length ? 'blocked' : 'ready',
      ...(!completed.has(artifact.id) && missingDeps.length ? { missingDeps } : {}),
    };
  }).sort((left, right) => buildOrder.indexOf(left.id) - buildOrder.indexOf(right.id));

  return {
    changeName,
    schemaName,
    schemaPath,
    planningHome: { root, changesDir: path.join(root, 'cwfspec', 'changes') },
    changeRoot: changeDir,
    artifactPaths,
    applyRequires: schema.apply.requires?.length ? schema.apply.requires : schema.artifacts.map((item) => item.id),
    artifacts,
  };
}
