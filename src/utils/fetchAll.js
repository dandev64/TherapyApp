const PAGE_SIZE = 1000

/**
 * Supabase returns at most 1000 rows per request (the project's "max rows"
 * setting), and `.range()` can't go past that, so full-history queries would
 * silently stop at 1000 tasks. This pages through until every row is in.
 * `build` must return a fresh query each call; rows are ordered by id last so
 * pages never overlap.
 */
export async function fetchAllRows(build) {
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().order('id').range(from, from + PAGE_SIZE - 1)
    if (error) return { data: null, error }
    rows.push(...data)
    if (data.length < PAGE_SIZE) return { data: rows, error: null }
  }
}
