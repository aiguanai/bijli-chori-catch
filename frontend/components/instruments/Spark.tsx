import { scaleLinear } from "d3-scale";
import { line } from "d3-shape";

type Props = {
  values: (number | null)[];
  width?: number;
  height?: number;
  marker?: number;
  threshold?: number;
};

/** Risk score over time, always on a fixed 0 to 1 scale so sparks compare. */
export function Spark({ values, width = 120, height = 32, marker, threshold }: Props) {
  const x = scaleLinear().domain([0, Math.max(values.length - 1, 1)]).range([2, width - 4]);
  const y = scaleLinear().domain([0, 1]).range([height - 3, 3]);
  const path = line<number | null>()
    .defined((value) => value != null)
    .x((_, index) => x(index))
    .y((value) => y(value ?? 0))(values);
  const at = marker ?? values.length - 1;
  const current = values[at];
  return (
    <svg width={width} height={height} aria-hidden className="block overflow-visible">
      {threshold != null && <line x1={0} x2={width} y1={y(threshold)} y2={y(threshold)} stroke="var(--signal)" strokeWidth="1" opacity="0.5" />}
      <path d={path ?? ""} fill="none" stroke="var(--foreground)" strokeWidth="1.5" strokeLinejoin="round" />
      {current != null && <circle cx={x(at)} cy={y(current)} r="3" fill="var(--signal)" stroke="var(--card)" strokeWidth="1.5" />}
    </svg>
  );
}
