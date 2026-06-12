"use client";
// Клиентские графики (Recharts), данные приходят сериализованными с сервера
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Legend, AreaChart, Area,
} from "recharts";

const ACC = "#2b59ff";
const OK = "#16a34a";
const BAD = "#dc2626";
const MUT = "#697086";

const rub = (v: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(v) + " ₽";
const num = (v: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(v);

export function OrdersChart({ data }: { data: { date: string; ordersSum: number; buyoutsSum: number; advSpend: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
        <CartesianGrid stroke="#eef0f6" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: MUT }} tickFormatter={(d: string) => d.slice(8) + "." + d.slice(5, 7)} />
        <YAxis tick={{ fontSize: 11, fill: MUT }} tickFormatter={(v: number) => num(v / 1000) + "к"} width={44} />
        <Tooltip formatter={(v: number | string, name: string) => [rub(Number(v)), name]} labelFormatter={(d) => String(d)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="ordersSum" name="Заказы" stroke={ACC} fill="#e8eeff" strokeWidth={2} />
        <Area type="monotone" dataKey="buyoutsSum" name="Выкупы" stroke={OK} fill="#e9f7ee" strokeWidth={2} />
        <Area type="monotone" dataKey="advSpend" name="Реклама" stroke={BAD} fill="#fdecec" strokeWidth={1.5} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CompetitorChart({ data }: { data: { date: string; sales: number | null; price: number | null; balance: number | null }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
        <CartesianGrid stroke="#eef0f6" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: MUT }} tickFormatter={(d: string) => d.slice(8) + "." + d.slice(5, 7)} />
        <YAxis yAxisId="l" tick={{ fontSize: 11, fill: MUT }} width={40} />
        <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: MUT }} width={48} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line yAxisId="l" type="monotone" dataKey="sales" name="Продажи, шт" stroke={ACC} strokeWidth={2} dot={false} />
        <Line yAxisId="r" type="monotone" dataKey="price" name="Цена, ₽" stroke={OK} strokeWidth={1.5} dot={false} />
        <Line yAxisId="l" type="monotone" dataKey="balance" name="Остаток" stroke={MUT} strokeWidth={1} dot={false} strokeDasharray="4 3" />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function KeywordChart({ data }: { data: { date: string; frequency: number | null }[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
        <CartesianGrid stroke="#eef0f6" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: MUT }} tickFormatter={(d: string) => d.slice(8) + "." + d.slice(5, 7)} />
        <YAxis tick={{ fontSize: 11, fill: MUT }} width={52} tickFormatter={(v: number) => num(v)} />
        <Tooltip formatter={(v: number | string) => [num(Number(v)), "частотность"]} />
        <Bar dataKey="frequency" fill={ACC} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StockHistoryChart({ data }: { data: { date: string; qty: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
        <CartesianGrid stroke="#eef0f6" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: MUT }} tickFormatter={(d: string) => d.slice(8) + "." + d.slice(5, 7)} />
        <YAxis tick={{ fontSize: 11, fill: MUT }} width={44} />
        <Tooltip />
        <Area type="stepAfter" dataKey="qty" name="Остаток WB, шт" stroke={ACC} fill="#e8eeff" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
