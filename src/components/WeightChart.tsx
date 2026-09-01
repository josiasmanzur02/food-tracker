import type { UnitSystem, WeightEntry } from '../types';
import { formatDateShort, parseDateKey, differenceInDays } from '../utils/dates';
import { buildWeightTrend } from '../utils/trends';
import { convertWeightToDisplay, formatWeight } from '../utils/units';

interface WeightChartProps {
  entries: WeightEntry[];
  goalWeightKg: number;
  unitSystem: UnitSystem;
}

interface PlotPoint {
  x: number;
  y: number;
  label: string;
}

const WIDTH = 320;
const HEIGHT = 220;
const PADDING = { top: 20, right: 16, bottom: 28, left: 20 };

function toPath(points: PlotPoint[]): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
}

function getPointX(date: string, startDate: string, totalDays: number, fallbackIndex: number, totalPoints: number) {
  if (totalDays <= 0) {
    const ratio = totalPoints === 1 ? 0 : fallbackIndex / (totalPoints - 1);
    return PADDING.left + ratio * (WIDTH - PADDING.left - PADDING.right);
  }

  const elapsedDays = differenceInDays(startDate, date);
  return (
    PADDING.left +
    (elapsedDays / totalDays) * (WIDTH - PADDING.left - PADDING.right)
  );
}

export function WeightChart({
  entries,
  goalWeightKg,
  unitSystem
}: WeightChartProps) {
  const trendPoints = buildWeightTrend(entries);
  const startDate = trendPoints[0]?.date;
  const endDate = trendPoints[trendPoints.length - 1]?.date;
  const totalDays =
    startDate && endDate ? differenceInDays(startDate, endDate) : 0;

  const displayValues = trendPoints.flatMap((point) =>
    point.trendKg === null
      ? [convertWeightToDisplay(point.actualKg, unitSystem)]
      : [
          convertWeightToDisplay(point.actualKg, unitSystem),
          convertWeightToDisplay(point.trendKg, unitSystem)
        ]
  );
  displayValues.push(convertWeightToDisplay(goalWeightKg, unitSystem));

  const minValue = Math.min(...displayValues);
  const maxValue = Math.max(...displayValues);
  const valuePadding = Math.max((maxValue - minValue) * 0.15, unitSystem === 'imperial' ? 1 : 0.5);
  const scaledMin = minValue - valuePadding;
  const scaledMax = maxValue + valuePadding;

  const toY = (value: number) => {
    const usableHeight = HEIGHT - PADDING.top - PADDING.bottom;
    const ratio = (value - scaledMin) / Math.max(scaledMax - scaledMin, 1);
    return HEIGHT - PADDING.bottom - ratio * usableHeight;
  };

  const actualPlot: PlotPoint[] = trendPoints.map((point, index) => ({
    x: getPointX(point.date, startDate ?? point.date, totalDays, index, trendPoints.length),
    y: toY(convertWeightToDisplay(point.actualKg, unitSystem)),
    label: formatDateShort(point.date)
  }));
  const trendPlot: PlotPoint[] = trendPoints
    .map((point, index) =>
      point.trendKg === null
        ? null
        : {
            x: getPointX(point.date, startDate ?? point.date, totalDays, index, trendPoints.length),
            y: toY(convertWeightToDisplay(point.trendKg, unitSystem)),
            label: formatDateShort(point.date)
          }
    )
    .filter((point): point is PlotPoint => point !== null);
  const goalY = toY(convertWeightToDisplay(goalWeightKg, unitSystem));
  const labelIndices = Array.from(
    new Set([0, Math.floor(actualPlot.length / 2), Math.max(actualPlot.length - 1, 0)])
  );

  return (
    <figure className="card chart-card">
      <div className="card__header">
        <div>
          <p className="section-label">Trend</p>
          <h2>Weight chart</h2>
        </div>
        <p className="supporting-copy">
          Goal {formatWeight(goalWeightKg, unitSystem)}
        </p>
      </div>
      <svg
        className="weight-chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Weight chart showing actual weigh-ins, moving average trend, and goal weight."
      >
        <line
          x1={PADDING.left}
          y1={goalY}
          x2={WIDTH - PADDING.right}
          y2={goalY}
          className="weight-chart__goal"
        />
        <path d={toPath(actualPlot)} className="weight-chart__line" />
        {trendPlot.length >= 2 ? (
          <path d={toPath(trendPlot)} className="weight-chart__trend" />
        ) : null}
        {actualPlot.map((point) => (
          <circle
            key={point.label}
            cx={point.x}
            cy={point.y}
            r="3"
            className="weight-chart__point"
          />
        ))}
        {labelIndices.map((index) => {
          const point = actualPlot[index];

          if (!point) {
            return null;
          }

          return (
            <text
              key={`${point.label}-${index}`}
              x={point.x}
              y={HEIGHT - 6}
              className="weight-chart__axis"
              textAnchor={index === 0 ? 'start' : index === actualPlot.length - 1 ? 'end' : 'middle'}
            >
              {point.label}
            </text>
          );
        })}
        <text x={PADDING.left} y={14} className="weight-chart__axis">
          {maxValue.toFixed(1)}
        </text>
        <text x={PADDING.left} y={HEIGHT - PADDING.bottom + 12} className="weight-chart__axis">
          {minValue.toFixed(1)}
        </text>
      </svg>
      <figcaption className="chart-card__summary">
        {entries.length >= 3
          ? 'The darker line shows actual weigh-ins. The lighter line shows your moving average trend when enough entries exist.'
          : 'Keep logging your weight to see your trend.'}
      </figcaption>
    </figure>
  );
}
