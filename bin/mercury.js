#!/usr/bin/env node

import path from 'node:path';
import { createChange, getPlanningRoot, validateChangeName } from '../src/mercury/new-change.js';
import { getChangeStatus, loadSchema } from '../src/mercury/artifact-graph.js';

function usage() {
  return [
    'Usage: falla new change <name> [--schema <name>] [--goal <text>] [--description <text>] [--json]',
    '       falla status --change <name> [--json]',
    '       falla instructions <proposal|design|tasks> --change <name> [--json]',
  ].join('\n');
}

function parseOptions(arguments_) {
  const options = {};
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--json') {
      options.json = true;
      continue;
    }
    if (argument === '--schema' || argument === '--goal' || argument === '--description') {
      const value = arguments_[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
      options[argument.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown option '${argument}'`);
  }
  return options;
}

function parseChangeOptions(arguments_) {
  const options = {};
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--json') {
      options.json = true;
      continue;
    }
    if (argument === '--change') {
      const value = arguments_[index + 1];
      if (!value || value.startsWith('--')) throw new Error('Missing value for --change');
      options.change = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown option '${argument}'`);
  }
  if (!options.change) throw new Error('Missing required option --change');
  const nameError = validateChangeName(options.change);
  if (nameError) throw new Error(nameError);
  return options;
}

const [verb, noun, name, ...arguments_] = process.argv.slice(2);
const jsonRequested = process.argv.slice(2).includes('--json');

try {
  if (verb === '--help' || verb === '-h') {
    console.log(usage());
  } else {
    if (verb === 'new' && noun === 'change' && name) {
      const options = parseOptions(arguments_);
      const change = await createChange(name, options);
      if (options.json) {
        console.log(JSON.stringify({ change }, null, 2));
      } else {
        console.log(`Created change '${change.id}' at ${change.path}/`);
        console.log(`Schema: ${change.schema}`);
        console.log(`Next: falla status --change ${change.id}`);
      }
    } else if (verb === 'status') {
      const options = parseChangeOptions([noun, name, ...arguments_].filter(Boolean));
      const output = getChangeStatus(getPlanningRoot(), options.change);
      console.log(options.json ? JSON.stringify(output, null, 2) : output.artifacts.map((artifact) => `${artifact.id}: ${artifact.status}`).join('\n'));
    } else if (verb === 'instructions' && noun) {
      const options = parseChangeOptions([name, ...arguments_].filter(Boolean));
      const status = getChangeStatus(getPlanningRoot(), options.change);
      const { schema } = loadSchema(getPlanningRoot(), status.changeRoot);
      const artifact = schema.artifacts.find((candidate) => candidate.id === noun);
      if (!artifact) throw new Error(`Unknown artifact '${noun}'`);
      const output = {
        artifact: artifact.id,
        change: options.change,
        resolvedOutputPath: path.join(status.changeRoot, artifact.generates),
        template: artifact.template ?? `# ${artifact.id}\n`,
        instruction: artifact.instruction ?? `创建 ${artifact.id} artifact，并满足 schema 中的依赖关系。`,
        dependencies: artifact.requires.map((id) => status.artifactPaths[id].existingOutputPaths),
      };
      console.log(options.json ? JSON.stringify(output, null, 2) : `${output.resolvedOutputPath}\n\n${output.instruction}`);
    } else {
      throw new Error(usage());
    }
  }
} catch (error) {
  if (jsonRequested) {
    console.log(JSON.stringify({ change: null, error: error.message }));
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
}
