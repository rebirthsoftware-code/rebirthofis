import { useMemo, type ReactElement } from "react";
import type { Department, Employee, EmployeeState, EmployeeStatus } from "@rebirth/shared";

/** İzometrik ofis: departmanlar cam bölmeli odalar, çalışanlar masalarının başında. */

const T = 72; // bir karenin piksel boyu
const WALL = 46; // cam duvar yüksekliği
const COS = 0.866;

type Pt = { x: number; y: number };
const iso = (x: number, y: number, z = 0): Pt => ({ x: (x - y) * T * COS, y: (x + y) * T * 0.5 - z });
const pts = (arr: Pt[]) => arr.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
const rectPoly = (x: number, y: number, w: number, h: number, z = 0) =>
  pts([iso(x, y, z), iso(x + w, y, z), iso(x + w, y + h, z), iso(x, y + h, z)]);

const STATUS_COLOR: Record<EmployeeStatus, string> = {
  idle: "#9ca3af",
  planning: "#f59e0b",
  working: "#22c55e",
  reviewing: "#3b82f6",
  collecting: "#a855f7",
  resting: "#64748b",
};

type EmployeePublic = Omit<Employee, "systemPrompt">;

interface Props {
  departments: Department[];
  employees: EmployeePublic[];
  states: EmployeeState[];
  selectedId?: string;
  onSelect: (employeeId: string) => void;
}

export function Office({ departments, employees, states, selectedId, onSelect }: Props) {
  const stateOf = useMemo(() => new Map(states.map((s) => [s.employeeId, s])), [states]);
  const deptOf = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);

  const gridW = Math.max(...departments.map((d) => d.x + d.w));
  const gridH = Math.max(...departments.map((d) => d.y + d.h));
  const rest = departments.find((d) => d.kind === "rest");

  // Dinlenenler yatakhaneye gider
  const resting = employees.filter((e) => stateOf.get(e.id)?.status === "resting");
  const bedSlots = rest ? Array.from({ length: Math.min(5, Math.floor(rest.w / 0.85)) }, (_, i) => ({
    x: rest.x + 0.55 + i * 0.85,
    y: rest.y + 0.6,
  })) : [];

  const items: Array<{ depth: number; node: ReactElement }> = [];
  const tags: ReactElement[] = [];

  // Masalar ve çalışanlar
  for (const e of employees) {
    const d = deptOf.get(e.departmentId);
    if (!d) continue;
    const s = stateOf.get(e.id);
    const dx = d.x + e.desk.x;
    const dy = d.y + e.desk.y;
    const restIdx = resting.indexOf(e);
    const atBed = restIdx >= 0 && bedSlots[restIdx];
    items.push({
      depth: dx + dy,
      node: <Desk key={`desk-${e.id}`} x={dx} y={dy} active={!!s && !["idle", "resting"].includes(s.status)} color={d.color} />,
    });
    const px = atBed ? atBed.x : dx;
    const py = atBed ? atBed.y + 0.5 : dy + 0.62;
    const personProps = {
      employee: e,
      state: s,
      color: d.color,
      x: px,
      y: py,
      selected: selectedId === e.id,
      onClick: () => onSelect(e.id),
    };
    items.push({ depth: px + py + 0.01, node: <Person key={`p-${e.id}`} layer="body" {...personProps} /> });
    tags.push(<Person key={`tag-${e.id}`} layer="tags" {...personProps} />);
  }
  // Yataklar
  bedSlots.forEach((b, i) => items.push({ depth: b.x + b.y - 0.3, node: <Bed key={`bed-${i}`} x={b.x} y={b.y} i={i} /> }));
  items.sort((a, b) => a.depth - b.depth);

  const margin = 0.7;
  const minX = iso(0 - margin, gridH + margin).x - 40;
  const maxX = iso(gridW + margin, 0 - margin).x + 40;
  const minY = -WALL - 60;
  const maxY = iso(gridW + margin, gridH + margin).y + 60;

  return (
    <svg
      className="office"
      viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="İzometrik ofis görünümü"
    >
      <defs>
        <linearGradient id="floor" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ece9e4" />
          <stop offset="1" stopColor="#d9d4cc" />
        </linearGradient>
        <linearGradient id="lawn" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4d7c4a" />
          <stop offset="1" stopColor="#36613a" />
        </linearGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Bahçe */}
      <polygon points={rectPoly(-margin, -margin, gridW + margin * 2, gridH + margin * 2)} fill="url(#lawn)" />
      <polygon points={rectPoly(-0.25, -0.25, gridW + 0.5, gridH + 0.5)} fill="#b9b3aa" />

      {/* Zeminler */}
      {departments.map((d) => (
        <g key={`floor-${d.id}`}>
          <polygon
            points={rectPoly(d.x, d.y, d.w, d.h)}
            fill={d.kind === "rest" ? "#cbbfae" : "url(#floor)"}
            stroke="#8f8a83"
            strokeWidth={0.8}
          />
          {/* Karolar */}
          {Array.from({ length: d.w - 1 }, (_, i) => (
            <line key={`v${i}`} {...line(iso(d.x + i + 1, d.y), iso(d.x + i + 1, d.y + d.h))} stroke="rgba(0,0,0,.08)" />
          ))}
          {Array.from({ length: d.h - 1 }, (_, i) => (
            <line key={`h${i}`} {...line(iso(d.x, d.y + i + 1), iso(d.x + d.w, d.y + i + 1))} stroke="rgba(0,0,0,.08)" />
          ))}
          {/* Departman renk şeridi */}
          <polyline
            points={pts([iso(d.x, d.y + d.h), iso(d.x + d.w, d.y + d.h), iso(d.x + d.w, d.y)])}
            fill="none"
            stroke={d.color}
            strokeWidth={3}
            opacity={0.9}
          />
        </g>
      ))}

      {/* Arka cam duvarlar */}
      {departments.filter((d) => d.kind !== "rest").map((d) => (
        <g key={`back-${d.id}`}>
          <Wall a={iso(d.x, d.y)} b={iso(d.x + d.w, d.y)} fill="rgba(255,255,255,.10)" />
          <Wall a={iso(d.x, d.y)} b={iso(d.x, d.y + d.h)} fill="rgba(255,255,255,.07)" />
        </g>
      ))}

      {/* Bitkiler */}
      {departments.filter((d) => d.kind !== "rest").map((d) => (
        <Plant key={`plant-${d.id}`} x={d.x + d.w - 0.3} y={d.y + 0.3} />
      ))}

      {/* Masalar, çalışanlar, yataklar (derinliğe göre sıralı) */}
      {items.map((i) => i.node)}

      {/* Ön cam duvarlar (çok saydam) */}
      {departments.filter((d) => d.kind !== "rest").map((d) => (
        <g key={`front-${d.id}`} pointerEvents="none">
          <Wall a={iso(d.x, d.y + d.h)} b={iso(d.x + d.w, d.y + d.h)} fill="rgba(255,255,255,.035)" />
          <Wall a={iso(d.x + d.w, d.y)} b={iso(d.x + d.w, d.y + d.h)} fill="rgba(255,255,255,.035)" />
        </g>
      ))}

      {/* İsim etiketleri ve baloncuklar: her şeyin üstünde */}
      {tags}

      {/* Departman etiketleri: ön duvarın ortasında, upright tabela */}
      {departments.map((d) => {
        const p = iso(d.x + d.w / 2, d.y + d.h);
        const w = d.name.length * 6.4 + 26;
        return (
          <g key={`label-${d.id}`} transform={`translate(${p.x - w / 2}, ${p.y + 11})`} pointerEvents="none">
            <rect x={0} y={-9} width={w} height={18} rx={4} fill="rgba(18,18,22,.92)" stroke="rgba(255,255,255,.12)" />
            <rect x={6} y={-4} width={8} height={8} rx={2} fill={d.color} />
            <text x={19} y={4} fill="#f5f5f4" fontSize={10.5} fontWeight={600} letterSpacing={0.5}>
              {d.name.toLocaleUpperCase("tr")}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function line(a: Pt, b: Pt) {
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

function Wall({ a, b, fill }: { a: Pt; b: Pt; fill: string }) {
  const poly = pts([a, b, { x: b.x, y: b.y - WALL }, { x: a.x, y: a.y - WALL }]);
  return (
    <g>
      <polygon points={poly} fill={fill} stroke="rgba(10,10,12,.85)" strokeWidth={1.4} strokeLinejoin="round" />
      <line x1={a.x} y1={a.y - WALL} x2={b.x} y2={b.y - WALL} stroke="#0a0a0c" strokeWidth={2.2} />
    </g>
  );
}

function Desk({ x, y, active, color }: { x: number; y: number; active: boolean; color: string }) {
  const H = 22;
  const w = 1.0;
  const h = 0.5;
  const x0 = x - w / 2;
  const y0 = y - h / 2;
  const m = iso(x, y - 0.05, H);
  return (
    <g>
      {/* ön yüzler */}
      <polygon points={pts([iso(x0, y0 + h), iso(x0 + w, y0 + h), iso(x0 + w, y0 + h, H), iso(x0, y0 + h, H)])} fill="#8f867d" />
      <polygon points={pts([iso(x0 + w, y0), iso(x0 + w, y0 + h), iso(x0 + w, y0 + h, H), iso(x0 + w, y0, H)])} fill="#a89f95" />
      <polygon points={rectPoly(x0, y0, w, h, H)} fill="#d6cfc6" stroke="#6b645d" strokeWidth={0.6} />
      {/* monitör */}
      <g transform={`translate(${m.x}, ${m.y})`}>
        <rect x={-1.5} y={-6} width={3} height={6} fill="#1f1f23" />
        <rect x={-11} y={-20} width={22} height={14} rx={1.5} fill="#15151a" stroke="#2b2b31" />
        <rect
          x={-9.5}
          y={-18.5}
          width={19}
          height={11}
          rx={1}
          fill={active ? color : "#2a2f3a"}
          opacity={active ? 0.9 : 1}
          filter={active ? "url(#glow)" : undefined}
          className={active ? "screen-on" : undefined}
        />
      </g>
    </g>
  );
}

function Plant({ x, y }: { x: number; y: number }) {
  const p = iso(x, y);
  return (
    <g transform={`translate(${p.x}, ${p.y})`} pointerEvents="none">
      <ellipse cx={0} cy={0} rx={7} ry={3.5} fill="rgba(0,0,0,.25)" />
      <rect x={-5} y={-9} width={10} height={9} rx={2} fill="#b5651d" />
      <circle cx={0} cy={-15} r={8} fill="#2f855a" />
      <circle cx={-5} cy={-11} r={6} fill="#38a169" />
      <circle cx={5} cy={-12} r={6} fill="#276749" />
    </g>
  );
}

const BED_COLORS = ["#c4a7d9", "#9fc5e8", "#d9b38c", "#f4a7b9", "#a8d8b9", "#f6d186"];
function Bed({ x, y, i }: { x: number; y: number; i: number }) {
  const w = 0.6;
  const h = 1.25;
  const H = 12;
  const x0 = x - w / 2;
  const y0 = y - 0.25;
  return (
    <g>
      <polygon points={pts([iso(x0, y0 + h), iso(x0 + w, y0 + h), iso(x0 + w, y0 + h, H), iso(x0, y0 + h, H)])} fill="#7c6f64" />
      <polygon points={pts([iso(x0 + w, y0), iso(x0 + w, y0 + h), iso(x0 + w, y0 + h, H), iso(x0 + w, y0, H)])} fill="#9a8c7f" />
      <polygon points={rectPoly(x0, y0, w, h, H)} fill={BED_COLORS[i % BED_COLORS.length]} stroke="#5c524a" strokeWidth={0.6} />
      <polygon points={rectPoly(x0 + 0.08, y0 + 0.08, w - 0.16, 0.28, H + 1)} fill="#fff" opacity={0.9} />
    </g>
  );
}

function Person({
  employee,
  state,
  color,
  x,
  y,
  selected,
  onClick,
  layer,
}: {
  employee: EmployeePublic;
  state?: EmployeeState;
  color: string;
  x: number;
  y: number;
  selected: boolean;
  onClick: () => void;
  /** body: derinlik sıralı figür, tags: en üstte çizilen etiket ve baloncuk */
  layer: "body" | "tags";
}) {
  const p = iso(x, y);
  const status: EmployeeStatus = state?.status ?? "idle";
  const busy = !["idle", "resting"].includes(status);
  const showBubble = busy;
  const note = state?.note ?? "";
  const tagW = employee.name.length * 6 + 24;
  const bubbleW = Math.min(170, note.length * 5.6 + 30);
  return (
    <g
      className={`emp ${status}${selected ? " selected" : ""}`}
      transform={`translate(${p.x}, ${p.y})`}
      onClick={onClick}
      style={{ cursor: "pointer" }}
    >
      {layer === "body" && <ellipse cx={0} cy={1} rx={11} ry={4.5} fill="rgba(0,0,0,.35)" />}
      {layer === "body" && selected && <ellipse cx={0} cy={1} rx={15} ry={6.5} fill="none" stroke="#fbbf24" strokeWidth={2} />}
      {layer === "body" && (status === "resting" ? (
        <g>
          <rect x={-10} y={-10} width={20} height={9} rx={4} fill={color} />
          <circle cx={13} cy={-7} r={6} fill="#f1c9a5" />
          <text x={16} y={-18} fontSize={9} fill="#e5e7eb" className="zz">
            zZ
          </text>
        </g>
      ) : (
        <g className="body">
          <rect x={-7} y={-26} width={14} height={20} rx={5} fill={color} />
          <rect x={-7} y={-13} width={6} height={13} rx={2} fill="#1f2937" />
          <rect x={1} y={-13} width={6} height={13} rx={2} fill="#1f2937" />
          <circle cx={0} cy={-33} r={7.5} fill="#f1c9a5" />
          <path d="M-7.5 -35 a7.5 7.5 0 0 1 15 0 v-1 a7.5 5 0 0 0 -15 0z" fill="#2b1d14" />
          {employee.isManager && <rect x={-2} y={-24} width={4} height={10} fill="#111" rx={1} />}
        </g>
      ))}

      {/* isim etiketi */}
      {layer === "tags" && (
      <g transform="translate(0,-50)">
        <rect x={-tagW / 2} y={-8} width={tagW} height={16} rx={8} fill="rgba(18,18,22,.9)" stroke="rgba(255,255,255,.08)" />
        <circle cx={-tagW / 2 + 9} cy={0} r={3.2} fill={STATUS_COLOR[status]} className={busy ? "pulse" : undefined} />
        <text x={4} y={3.5} textAnchor="middle" fill="#fafaf9" fontSize={9.5} fontWeight={600}>
          {employee.name}
        </text>
      </g>
      )}

      {/* durum baloncuğu */}
      {layer === "tags" && showBubble && (
        <g transform="translate(0,-76)" className="bubble">
          <path d={`M-5 9 L0 15 L5 9 Z`} fill="#fff" />
          <rect x={-bubbleW / 2} y={-10} width={bubbleW} height={20} rx={6} fill="#fff" />
          <text x={busy ? -6 : 0} y={3.5} textAnchor="middle" fill="#18181b" fontSize={9}>
            {truncate(note, 28)}
          </text>
          {busy && (
            <g transform={`translate(${bubbleW / 2 - 14},0)`} className="dots">
              <circle cx={0} cy={0} r={1.6} fill="#18181b" />
              <circle cx={4.5} cy={0} r={1.6} fill="#18181b" />
              <circle cx={9} cy={0} r={1.6} fill="#18181b" />
            </g>
          )}
        </g>
      )}
    </g>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
