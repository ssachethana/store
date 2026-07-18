import { RefreshCw } from "lucide-react";
import { Period } from "./types";

const periods: { key: Period; label: string }[] = [
  { key: "day", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];

interface PeriodToolbarProps {
  period: Period;
  onPeriodChange: (period: Period) => void;
  loading: boolean;
  onRefresh: () => void;
}

export function PeriodToolbar({ period, onPeriodChange, loading, onRefresh }: PeriodToolbarProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-100 shadow-sm p-1">
        {periods.map((p) => (
          <button
            key={p.key}
            onClick={() => onPeriodChange(p.key)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
              period === p.key
                ? "bg-[#F5A623] text-white shadow-sm"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <button
        onClick={onRefresh}
        disabled={loading}
        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-500 hover:bg-gray-50 shadow-sm transition disabled:opacity-50"
      >
        <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        Refresh
      </button>
    </div>
  );
}