const CATEGORY_KEYWORDS = new Map([
  ["Food", ["swiggy", "zomato", "restaurant", "cafe", "chai point", "food"]],
  ["Travel", ["uber", "ola", "irctc", "rapido", "flight", "metro"]],
  ["Shopping", ["amazon", "flipkart", "myntra", "shopping"]],
  ["Utilities", ["bill", "electricity", "water", "gas", "broadband", "recharge"]],
]);

export function categorizeMerchant(merchant, fallback = "Other") {
  const normalizedMerchant = typeof merchant === "string" ? merchant.toLowerCase() : "";

  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((keyword) => normalizedMerchant.includes(keyword))) {
      return category;
    }
  }

  return fallback;
}
