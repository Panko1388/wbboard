// Акции: калькулятор входа — что произойдёт с маржой при снижении цены
import { requireModule } from "@/lib/auth";
import { PromoCalc } from "./calc";

export const dynamic = "force-dynamic";

export default async function PromoPage() {
  await requireModule("promo");
  return (
    <>
      <h1>Акции · калькулятор входа</h1>
      <p className="sub">Юнит-экономика «до/после» по формулам спеки §4/§17 (УСН 2% + НДС 7/107 без вычетов)</p>
      <PromoCalc />
    </>
  );
}
