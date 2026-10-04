/** Storage paths (or legacy full URLs) of a task's proof photos. */
export function getProofPaths(task) {
  if (task?.proof_urls?.length) return task.proof_urls
  return task?.proof_url ? [task.proof_url] : []
}
