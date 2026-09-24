export function assertConsistentConfigurationRevision(before, bootstrap, after) {
  const revision = value => Number(value);
  const start = revision(before?.revision);
  const content = revision(bootstrap?.configurationRevision);
  const end = revision(after?.revision);
  if (before?.legacy === true || after?.legacy === true ||
      !Number.isSafeInteger(start) || !Number.isSafeInteger(content) ||
      !Number.isSafeInteger(end) || start < 1 || start !== content || content !== end) {
    throw new Error('CONFIGURATION_CHANGED_DURING_SYNC');
  }
  return end;
}
