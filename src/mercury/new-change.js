import { stat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_SCHEMA = 'spec-driven';

async function directoryExists(candidate) {
  try {
    return (await stat(candidate)).isDirectory();
  } catch {
    return false;
  }
}

/** Validates the lowercase kebab-case identifier required for a change. */
export function validateChangeName(name) {
  if (!name) return 'Change name cannot be empty';
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
    return 'Change name must use lowercase kebab-case (for example, add-auth)';
  }
  return undefined;
}

/**
 * Returns the current project's planning root.
 *
 * An explicit `cwd` is retained for programmatic callers and tests. The CLI
 * uses CWF_HOME when explicitly configured; otherwise it uses the
 * command's working directory so globally-installed CustomWorkFlow never writes
 * changes back into its own package checkout.
 */
export function getPlanningRoot(options = {}) {
  return path.resolve(options.cwd ?? process.env.CWF_HOME ?? process.cwd());
}

function yamlString(value) {
  return JSON.stringify(value);
}

/**
 * Creates a local OpenSpec change scaffold.
 *
 * By default, all generated files are stored under the current project's
 * `cwfspec/` directory. The command never searches parent directories for
 * an unrelated OpenSpec workspace.
 */
export async function createChange(name, options = {}) {
  const nameError = validateChangeName(name);
  if (nameError) throw new Error(nameError);

  const root = getPlanningRoot(options);
  const schema = options.schema ?? DEFAULT_SCHEMA;
  const specDir = path.join(root, 'cwfspec');
  const changesDir = path.join(specDir, 'changes');
  const changeDir = path.join(changesDir, name);

  if (await directoryExists(changeDir)) {
    throw new Error(`Change '${name}' already exists at ${changeDir}`);
  }

  await mkdir(changesDir, { recursive: true });
  try {
    await mkdir(changeDir);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error(`Change '${name}' already exists at ${changeDir}`);
    }
    throw error;
  }

  await mkdir(path.join(specDir, 'specs'), { recursive: true });
  await mkdir(path.join(changesDir, 'archive'), { recursive: true });

  const configPath = path.join(specDir, 'config.yaml');
  const configYmlPath = path.join(specDir, 'config.yml');
  if (!(await pathExists(configPath)) && !(await pathExists(configYmlPath))) {
    await writeFile(configPath, `schema: ${DEFAULT_SCHEMA}\n`, 'utf8');
  }

  const metadata = [
    `schema: ${yamlString(schema)}`,
    `created: ${new Date().toISOString().slice(0, 10)}`,
  ];
  if (options.goal) metadata.push(`goal: ${yamlString(options.goal)}`);
  await writeFile(path.join(changeDir, '.openspec.yaml'), `${metadata.join('\n')}\n`, 'utf8');

  if (options.description) {
    await writeFile(path.join(changeDir, 'README.md'), `# ${name}\n\n${options.description}\n`, 'utf8');
  }

  return {
    id: name,
    path: changeDir,
    metadataPath: path.join(changeDir, '.openspec.yaml'),
    schema,
    root,
  };
}

async function pathExists(candidate) {
  try {
    await stat(candidate);
    return true;
  } catch {
    return false;
  }
}
