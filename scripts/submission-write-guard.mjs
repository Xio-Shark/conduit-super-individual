import { chmod, lstat, mkdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

export const FINAL_EVIDENCE_FILENAMES = new Set([
  "u6-rehearsal-manifest.json",
  "video-evidence.json",
  "external-submission-evidence.json",
  "defense-rehearsal-evidence.json",
]);

export async function resolveSafeWriteTarget(projectRoot, writeTo, label) {
  const target = await resolveProjectWriteTarget(projectRoot, writeTo, label);
  const relativeTarget = path.relative(projectRoot, target);
  if (FINAL_EVIDENCE_FILENAMES.has(path.basename(target))) {
    throw new Error(`Refusing to write ${label} to final evidence file ${relativeTarget}`);
  }
  return target;
}

export async function resolveProjectWriteTarget(projectRoot, writeTo, label) {
  const target = path.resolve(projectRoot, writeTo);
  const relativeTarget = path.relative(projectRoot, target);
  if (relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget)) {
    throw new Error(`Refusing to write ${label} outside project root: ${writeTo}`);
  }
  await assertRealParentInsideProject(projectRoot, target, label, writeTo);
  await assertTargetIsNotSymlink(target, label, relativeTarget);
  return target;
}

async function assertRealParentInsideProject(projectRoot, target, label, writeTo) {
  const realProjectRoot = await realpath(projectRoot);
  const nearestParent = await nearestExistingParent(path.dirname(target));
  const realParent = await realpath(nearestParent);
  const relativeParent = path.relative(realProjectRoot, realParent);
  if (relativeParent.startsWith("..") || path.isAbsolute(relativeParent)) {
    throw new Error(`Refusing to write ${label} through a symlinked parent outside project root: ${writeTo}`);
  }
}

async function nearestExistingParent(directory) {
  try {
    const stats = await lstat(directory);
    if (!stats.isDirectory() && !stats.isSymbolicLink()) throw new Error(`Write parent is not a directory: ${directory}`);
    return directory;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    const parent = path.dirname(directory);
    if (parent === directory) throw error;
    return nearestExistingParent(parent);
  }
}

async function assertTargetIsNotSymlink(target, label, relativeTarget) {
  try {
    const stats = await lstat(target);
    if (stats.isSymbolicLink()) {
      throw new Error(`Refusing to write ${label} to symlink target ${relativeTarget}`);
    }
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
}

export async function writeGeneratedOutput(target, output) {
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${output}\n`);
  await chmod(target, output.startsWith("#!/usr/bin/env bash\n") ? 0o755 : 0o644);
}
