// РНП — рука на пульсе: дни раскрываются в детализацию по SKU с фото
import { cookies } from "next/headers";
import { requireModule, cabinetScope } from "@/lib/auth";
import { rnpByDay, rnpDayDetails } from "@/lib/pl";
import { resolvePeriod } from "@/lib/period";
import { PeriodSeg } from "@/components/PeriodSeg";
import { RnpTable } from "@/components/RnpTable";
import { Empty } from "@/components/ui";
import { DoodleChart } from "@/components/doodles";

export const dynamic = "force-dynamic";

export default async function RnpPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const user = await requireModule("rnp");
  const { p } = await searchParams;
  const { key, period } = resolvePeriod(p, "today");
  const cab = cabinetScope(user, (await cookies()).get("wbboard_cab")?.value);

  const [days, details] = await Promise.all([
    rnpByDay(period, cab),
    rnpDayDetails(period, cab),
  ]);
  const has = days.some(d => d.ordersCount > 0);

  return (
    <>
      <h1>РНП — рука на пульсе</h1>
      <p className="sub">Клик по дню раскрывает детализацию по товарам · выкуп ≈ forPay (к перечислению)</p>
      <PeriodSeg base="/rnp" current={key} />
      {!has ? (
        <Empty art={<DoodleChart />} title="Нет данных" hint="Дождитесь первого прохода коллекторов или загрузите демо: npm run seed" />
      ) : (
        <RnpTable days={[...days].reverse()} details={details} />
      )}
    </>
  );
}
