const PAGE_SIZE = 1000

/**
 * Supabase returns at most 1000 rows per request (the project's "max rows"
 * setting), so full-history queries would silently stop at 1000 tasks. This
 * pages through until every row is in.
 * `build` must return a fresh query each call, must select `id`, and must not
 * add its own ordering: pages are keyed on id (id > last id seen), so no row is
 * skipped or repeated and the database never re-scans earlier pages.
 */
export async function fetchAllRows(build) {
  const rows = []
  let lastId = null
  for (;;) {
    let query = build()
    if (lastId) query = query.gt('id', lastId)
    const { data, error } = await query.order('id').limit(PAGE_SIZE)
    if (error) return { data: null, error }
    rows.push(...data)
    if (data.length < PAGE_SIZE) return { data: rows, error: null }
    lastId = data[data.length - 1].id
  }
}
