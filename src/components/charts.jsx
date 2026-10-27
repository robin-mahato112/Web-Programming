import { useLayoutEffect, useRef, useState } from 'react'
import { seriesColors } from './chartColors.js'

const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max))

function niceTicks(max, count = 4) {
  const raw = (max || 1) / count
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10]
    .map((multiple) => multiple * magnitude)
    .find((value) => value >= raw)
  return Array.from({ length: Math.ceil((max || 1) / step) + 1 }, (_, index) => index * step)
}

// Tracks the plot width and the single tooltip each chart shows.
function usePlot() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  const [tip, setTip] = useState(null)
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  const showAt = (x, y, content) => setTip({ ...content, x: clamp(x, 80, width - 80), y })
  const showOver = (element, content) => {
    const box = ref.current.getBoundingClientRect()
    const rect = element.getBoundingClientRect()
    showAt(rect.left + rect.width / 2 - box.left, rect.top - box.top, content)
  }
  return { ref, width, tip, showAt, showOver, hide: () => setTip(null) }
}

// Tooltips repeat values that are also in the data table, so screen readers use the table instead.
function Tooltip({ tip }) {
  if (!tip) return null
  return (
    <div className="chart-tooltip" style={{ left: tip.x, top: tip.y }} aria-hidden="true">
      <span className="chart-tooltip__title">{tip.title}</span>
      {tip.rows.map((row) => (
        <span key={row.label} className="chart-tooltip__row">
          <span className="chart-tooltip__key" style={{ background: row.color }} />
          <strong>{row.value}</strong>
          <span>{row.label}</span>
        </span>
      ))}
      {tip.note && <span className="chart-tooltip__note">{tip.note}</span>}
    </div>
  )
}

export function Legend({ items }) {
  return (
    <ul className="chart-legend">
      {items.map((item) => (
        <li key={item.label}>
          <span
            className={
              item.shape === 'line'
                ? 'chart-legend__key chart-legend__key--line'
                : 'chart-legend__key'
            }
            style={{ background: item.color }}
            aria-hidden="true"
          />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

export function ChartCard({ title, subtitle, legend, table, wide = false, children }) {
  return (
    <figure className={wide ? 'chart-card chart-card--wide' : 'chart-card'}>
      <figcaption>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </figcaption>
      {legend && <Legend items={legend} />}
      {children}
      {table && (
        <details className="chart-table">
          <summary>Show data table</summary>
          <div className="table-wrap" role="region" aria-label={`${title} data`} tabIndex={0}>
            <table>
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr>
                  {table.columns.map((column) => (
                    <th key={column} scope="col">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map(([first, ...cells]) => (
                  <tr key={first}>
                    <th scope="row">{first}</th>
                    {cells.map((cell, index) => (
                      <td key={index}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </figure>
  )
}

export function LineChart({
  data,
  name,
  format,
  formatTick = format,
  color = seriesColors[0],
  height = 260,
}) {
  const { ref, width, tip, showAt, hide } = usePlot()
  const [active, setActive] = useState(null)
  const margin = { top: 32, right: 24, bottom: 32, left: 60 }
  const innerWidth = Math.max(width - margin.left - margin.right, 1)
  const innerHeight = height - margin.top - margin.bottom
  const ticks = niceTicks(Math.max(...data.map((point) => point.value)))
  const last = data.length - 1
  const step = last > 0 ? innerWidth / last : innerWidth
  const x = (index) => margin.left + (last > 0 ? index * step : innerWidth / 2)
  const y = (value) => margin.top + innerHeight * (1 - value / ticks.at(-1))
  const line = data
    .map((point, index) => `${index ? 'L' : 'M'}${x(index)},${y(point.value)}`)
    .join('')
  // Thin the x labels to roughly one per 48px, always keeping the latest point.
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(innerWidth / 48))))

  const select = (index) => {
    setActive(index)
    showAt(x(index), y(data[index].value), {
      title: data[index].label,
      rows: [{ label: name, value: format(data[index].value), color }],
    })
  }
  const clear = () => {
    setActive(null)
    hide()
  }
  const pointer = (event) => {
    const box = event.currentTarget.ownerSVGElement.getBoundingClientRect()
    select(clamp(Math.round((event.clientX - box.left - margin.left) / step), 0, last))
  }
  const keyboard = (event) => {
    const moves = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity }
    if (!(event.key in moves)) return
    event.preventDefault()
    select(clamp((active ?? last) + moves[event.key], 0, last))
  }

  return (
    <div ref={ref} className="chart-plot" style={{ minHeight: height }}>
      {width > 0 && (
        <svg
          className="line-chart"
          width={width}
          height={height}
          role="img"
          tabIndex={0}
          aria-label={`${name} from ${data[0].label} to ${data[last].label}. Use the left and right arrow keys to read each month.`}
          onFocus={() => select(active ?? last)}
          onBlur={clear}
          onKeyDown={keyboard}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                className={tick === 0 ? 'line-chart__baseline' : 'line-chart__grid'}
                x1={margin.left}
                x2={width - margin.right}
                y1={y(tick)}
                y2={y(tick)}
              />
              <text x={margin.left - 10} y={y(tick)} dy="0.32em" textAnchor="end">
                {formatTick(tick)}
              </text>
            </g>
          ))}
          {data.map(
            (point, index) =>
              (last - index) % labelEvery === 0 && (
                <text key={point.label} x={x(index)} y={height - 8} textAnchor="middle">
                  {point.short}
                </text>
              ),
          )}
          <path d={`${line}L${x(last)},${y(0)}L${x(0)},${y(0)}Z`} fill={color} opacity="0.1" />
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {active !== null && (
            <line
              className="line-chart__crosshair"
              x1={x(active)}
              x2={x(active)}
              y1={margin.top}
              y2={y(0)}
            />
          )}
          <circle
            cx={x(last)}
            cy={y(data[last].value)}
            r="4"
            fill={color}
            className="line-chart__dot"
          />
          {active !== null && (
            <circle
              cx={x(active)}
              cy={y(data[active].value)}
              r="5"
              fill={color}
              className="line-chart__dot"
            />
          )}
          <text
            className="line-chart__label"
            x={x(last)}
            y={y(data[last].value) - 14}
            textAnchor="end"
          >
            {format(data[last].value)}
          </text>
          <rect
            x="0"
            y="0"
            width={width}
            height={height}
            fill="transparent"
            onPointerMove={pointer}
            onPointerLeave={clear}
          />
        </svg>
      )}
      <p className="sr-only" aria-live="polite">
        {active !== null ? `${data[active].label}: ${format(data[active].value)}` : ''}
      </p>
      <Tooltip tip={tip} />
    </div>
  )
}

function StatusTag({ status }) {
  return (
    <span className="status-tag">
      <span
        className="status-tag__icon"
        style={{ background: status.color, color: status.ink }}
        aria-hidden="true"
      >
        {status.icon}
      </span>
      {status.label}
    </span>
  )
}

// Horizontal bars with the value at each bar's tip. Items may carry a status that recolours the bar.
export function BarList({ items, series, format }) {
  const { ref, tip, showOver, hide } = usePlot()
  const max = Math.max(1, ...items.flatMap((item) => series.map((entry) => item.values[entry.key])))
  const describe = (item) =>
    series.map((entry) => `${entry.name} ${format(item.values[entry.key])}`).join(', ') +
    (item.status ? `, ${item.status.label}` : '')
  const show = (event, item) =>
    showOver(event.currentTarget.querySelector('.bar-list__bars'), {
      title: item.label,
      rows: series.map((entry) => ({
        label: entry.name,
        value: format(item.values[entry.key]),
        color: item.status?.color || entry.color,
      })),
      note: item.status?.label,
    })

  return (
    <div ref={ref} className="chart-plot">
      <ul
        className={[
          'bar-list',
          series.length > 1 && 'bar-list--multi',
          items.some((item) => item.status) && 'bar-list--status',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {items.map((item) => (
          <li
            key={item.id}
            className="bar-list__row"
            tabIndex={0}
            aria-label={`${item.label}: ${describe(item)}`}
            onPointerEnter={(event) => show(event, item)}
            onFocus={(event) => show(event, item)}
            onPointerLeave={hide}
            onBlur={hide}
          >
            <span className="bar-list__label">{item.label}</span>
            <span className="bar-list__bars">
              {series.map((entry) => {
                const value = item.values[entry.key]
                return (
                  <span key={entry.key} className="bar-list__bar-row">
                    {value > 0 && (
                      <span
                        className="bar-list__bar"
                        style={{
                          '--ratio': value / max,
                          background: item.status?.color || entry.color,
                        }}
                      />
                    )}
                    <span className="bar-list__value">{format(value)}</span>
                    {item.status && <StatusTag status={item.status} />}
                  </span>
                )
              })}
            </span>
          </li>
        ))}
      </ul>
      <Tooltip tip={tip} />
    </div>
  )
}

// A single 100% bar split into parts, with the legend carrying each part's value.
export function StackedBar({ segments, format }) {
  const { ref, tip, showOver, hide } = usePlot()
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  const share = (value) => `${total ? Math.round((value / total) * 100) : 0}%`
  const show = (event, segment) =>
    showOver(event.currentTarget, {
      title: segment.label,
      rows: [
        {
          label: `${share(segment.value)} of total`,
          value: format(segment.value),
          color: segment.color,
        },
      ],
    })

  return (
    <div ref={ref} className="chart-plot">
      <div className="stacked-bar">
        {segments
          .filter((segment) => segment.value > 0)
          .map((segment) => (
            <span
              key={segment.key}
              className="stacked-bar__segment"
              tabIndex={0}
              aria-label={`${segment.label}: ${format(segment.value)} (${share(segment.value)})`}
              style={{ flexGrow: segment.value, background: segment.color }}
              onPointerEnter={(event) => show(event, segment)}
              onFocus={(event) => show(event, segment)}
              onPointerLeave={hide}
              onBlur={hide}
            />
          ))}
      </div>
      <ul className="chart-legend chart-legend--values">
        {segments.map((segment) => (
          <li key={segment.key}>
            <span
              className="chart-legend__key"
              style={{ background: segment.color }}
              aria-hidden="true"
            />
            {segment.label}
            <strong>{format(segment.value)}</strong>
            <span>{share(segment.value)}</span>
          </li>
        ))}
      </ul>
      <Tooltip tip={tip} />
    </div>
  )
}
