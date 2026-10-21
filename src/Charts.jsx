import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const COLORS = ["#246b53", "#e4a44f", "#698ec2", "#d77a6b", "#9172ac", "#80a99c"];

export function CategoryChart({ data, currency }) {
  return (
    <div className="category-chart">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="total"
            nameKey="category"
            innerRadius={58}
            outerRadius={82}
            paddingAngle={4}
          >
            {data.map((entry, index) => (
              <Cell fill={COLORS[index % COLORS.length]} key={entry.category} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => currency.format(Number(value))} />
        </PieChart>
      </ResponsiveContainer>
      <div className="category-legend">
        {data.map((entry, index) => (
          <div className="legend-row" key={entry.category}>
            <span className="legend-label">
              <i style={{ backgroundColor: COLORS[index % COLORS.length] }} />
              {entry.category}
            </span>
            <strong>{currency.format(entry.total)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DailyChart({ data, currency }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 10, left: 2, bottom: 0 }}>
        <CartesianGrid stroke="#edf0ec" strokeDasharray="3 5" vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="label"
          tickLine={false}
          tick={{ fill: "#8a948e", fontSize: 11 }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: "#8a948e", fontSize: 11 }}
          tickFormatter={(value) => `₹${value}`}
        />
        <Tooltip formatter={(value) => currency.format(Number(value))} />
        <Bar dataKey="total" fill="#357b60" maxBarSize={34} radius={[5, 5, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
