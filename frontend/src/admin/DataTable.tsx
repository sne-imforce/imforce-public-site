import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { FiChevronDown, FiChevronLeft, FiChevronRight, FiChevronUp, FiSearch, FiX } from 'react-icons/fi'

export type Column<Row> = {
  key: string
  header: string
  render: (row: Row) => ReactNode
  /** Value used for sorting. Omit to make the column unsortable. */
  sortValue?: (row: Row) => string | number
  className?: string
}

export type Filter<Row> = {
  id: string
  label: string
  options: Array<{ value: string; label: string }>
  matches: (row: Row, value: string) => boolean
}

type Props<Row> = {
  /** Accessible name of the table, e.g. "Job posts". */
  label: string
  rows: Row[]
  columns: Array<Column<Row>>
  rowId: (row: Row) => string
  /** Text searched by the search box (lower-cased internally). */
  searchText: (row: Row) => string
  searchPlaceholder?: string
  filters?: Array<Filter<Row>>
  initialSort: { key: string; direction: 'asc' | 'desc' }
  pageSize?: number
  emptyMessage: string
  /** Optional extra content shown when a row is expanded. */
  renderDetails?: (row: Row) => ReactNode
  /** Optional per-row action buttons. */
  renderActions?: (row: Row) => ReactNode
}

const compare = (a: string | number, b: string | number) =>
  typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'en-ZA', { sensitivity: 'base', numeric: true })

/**
 * Searchable, sortable, filterable table that shows `pageSize` rows at a time.
 * On narrow screens each row is laid out as a card (see admin.css).
 */
export default function DataTable<Row>({
  label, rows, columns, rowId, searchText, searchPlaceholder = 'Search…', filters = [],
  initialSort, pageSize = 10, emptyMessage, renderDetails, renderActions,
}: Props<Row>) {
  const [query, setQuery] = useState('')
  const [filterValues, setFilterValues] = useState<Record<string, string>>({})
  const [sort, setSort] = useState(initialSort)
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const sortColumn = columns.find((column) => column.key === sort.key)
    const result = rows.filter((row) =>
      (!needle || searchText(row).toLowerCase().includes(needle))
      && filters.every((filter) => !filterValues[filter.id] || filter.matches(row, filterValues[filter.id])))
    if (sortColumn?.sortValue) {
      const value = sortColumn.sortValue
      result.sort((a, b) => compare(value(a), value(b)) * (sort.direction === 'asc' ? 1 : -1))
    }
    return result
  }, [rows, query, filters, filterValues, columns, sort, searchText])

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const pageRows = visible.slice(currentPage * pageSize, currentPage * pageSize + pageSize)
  const firstShown = visible.length === 0 ? 0 : currentPage * pageSize + 1
  const lastShown = currentPage * pageSize + pageRows.length
  const isFiltered = Boolean(query.trim()) || Object.values(filterValues).some(Boolean)
  const columnCount = columns.length + (renderActions ? 1 : 0) + (renderDetails ? 1 : 0)

  const toggleSort = (key: string) => {
    setSort((current) => current.key === key
      ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: 'asc' })
    setPage(0)
  }

  const clearAll = () => { setQuery(''); setFilterValues({}); setPage(0) }

  return (
    <div className="data-table">
      <div className="data-table__toolbar" role="search" aria-label={`Search and filter ${label.toLowerCase()}`}>
        <label className="data-table__search">
          <FiSearch aria-hidden="true" />
          <span className="visually-hidden">Search {label.toLowerCase()}</span>
          <input
            type="search"
            value={query}
            placeholder={searchPlaceholder}
            onChange={(event) => { setQuery(event.target.value); setPage(0) }}
          />
        </label>
        {filters.map((filter) => (
          <label key={filter.id} className="data-table__filter">
            <span>{filter.label}</span>
            <select
              value={filterValues[filter.id] ?? ''}
              onChange={(event) => { setFilterValues((current) => ({ ...current, [filter.id]: event.target.value })); setPage(0) }}
            >
              <option value="">All</option>
              {filter.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        ))}
        {isFiltered && (
          <button type="button" className="data-table__clear" onClick={clearAll}>
            <FiX aria-hidden="true" /> Clear
          </button>
        )}
      </div>

      <div className="data-table__scroll">
        <table>
          <caption className="visually-hidden">
            {label}, sorted by {columns.find((column) => column.key === sort.key)?.header ?? sort.key} {sort.direction === 'asc' ? 'ascending' : 'descending'}
          </caption>
          <thead>
            <tr>
              {renderDetails && <th scope="col" className="data-table__expand-col"><span className="visually-hidden">Details</span></th>}
              {columns.map((column) => {
                const active = sort.key === column.key
                return (
                  <th
                    key={column.key}
                    scope="col"
                    className={column.className}
                    aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : column.sortValue ? 'none' : undefined}
                  >
                    {column.sortValue ? (
                      <button type="button" className="data-table__sort" onClick={() => toggleSort(column.key)}>
                        {column.header}
                        <span className={`data-table__sort-icon${active ? ' is-active' : ''}`} aria-hidden="true">
                          {active && sort.direction === 'asc' ? <FiChevronUp /> : <FiChevronDown />}
                        </span>
                      </button>
                    ) : column.header}
                  </th>
                )
              })}
              {renderActions && <th scope="col" className="data-table__actions-col"><span className="visually-hidden">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr className="data-table__empty-row">
                <td colSpan={columnCount}>
                  {isFiltered ? 'No results match your search or filters.' : emptyMessage}
                </td>
              </tr>
            ) : pageRows.map((row) => {
              const id = rowId(row)
              const isOpen = expanded === id
              return (
                <Fragment key={id}>
                  <tr className={isOpen ? 'is-expanded' : undefined}>
                    {renderDetails && (
                      <td className="data-table__expand-col">
                        <button
                          type="button"
                          className="data-table__expand"
                          aria-expanded={isOpen}
                          aria-controls={`details-${id}`}
                          onClick={() => setExpanded(isOpen ? null : id)}
                        >
                          <FiChevronRight aria-hidden="true" />
                          <span className="visually-hidden">{isOpen ? 'Hide details' : 'Show details'}</span>
                        </button>
                      </td>
                    )}
                    {columns.map((column) => (
                      <td key={column.key} className={column.className} data-label={column.header}>
                        <div className="data-table__cell">{column.render(row)}</div>
                      </td>
                    ))}
                    {renderActions && <td className="data-table__actions-col">{renderActions(row)}</td>}
                  </tr>
                  {renderDetails && isOpen && (
                    <tr className="data-table__details-row" id={`details-${id}`}>
                      <td colSpan={columnCount}>{renderDetails(row)}</td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="data-table__footer">
        <p aria-live="polite">
          {visible.length === 0 ? 'No items' : `Showing ${firstShown}–${lastShown} of ${visible.length}`}
          {isFiltered && rows.length !== visible.length ? ` (filtered from ${rows.length})` : ''}
        </p>
        {pageCount > 1 && (
          <nav className="data-table__pager" aria-label={`${label} pages`}>
            <button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 0} aria-label="Previous page">
              <FiChevronLeft aria-hidden="true" />
            </button>
            <span>Page {currentPage + 1} of {pageCount}</span>
            <button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= pageCount - 1} aria-label="Next page">
              <FiChevronRight aria-hidden="true" />
            </button>
          </nav>
        )}
      </div>
    </div>
  )
}
