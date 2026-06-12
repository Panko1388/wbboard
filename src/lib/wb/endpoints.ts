// Базовые URL по категориям (research/01-wb-seller-api.md §1)
export const WB = {
  orders: "https://statistics-api.wildberries.ru/api/v1/supplier/orders",
  sales: "https://statistics-api.wildberries.ru/api/v1/supplier/sales",
  stocks: "https://statistics-api.wildberries.ru/api/v1/supplier/stocks",
  finreport: "https://statistics-api.wildberries.ru/api/v5/supplier/reportDetailByPeriod",
  paidStorage: "https://seller-analytics-api.wildberries.ru/api/v1/paid_storage",
  acceptance: "https://seller-analytics-api.wildberries.ru/api/v1/acceptance_report",
  commission: "https://common-api.wildberries.ru/api/v1/tariffs/commission",
  tariffsBox: "https://common-api.wildberries.ru/api/v1/tariffs/box",
  advCount: "https://advert-api.wildberries.ru/adv/v1/promotion/count",
  advUpd: "https://advert-api.wildberries.ru/adv/v1/upd",
  advFullstats: "https://advert-api.wildberries.ru/adv/v3/fullstats",
  nmReport: "https://seller-analytics-api.wildberries.ru/api/v2/nm-report/detail",
  balance: "https://finance-api.wildberries.ru/api/v1/account/balance",
  news: "https://common-api.wildberries.ru/api/communications/v2/news",
} as const;
