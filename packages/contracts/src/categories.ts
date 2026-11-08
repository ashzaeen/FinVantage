import { z } from "zod";
import { Cents } from "./common";

/*
 * Spending categories: FinVantage's ~20 categories, their default subcategories, and the map from
 * Plaid's 127 detailed categories (Personal Finance Category v2, a superset of v1).
 * Built from https://plaid.com/documents/pfc-taxonomy-all.csv; edit it here directly. A test checks that
 * every Plaid category maps to a category that exists. Design: docs/workstreams/spending.md.
 */

/** Where spending counts in the Needs, Wants and Savings split. "excluded" is not spending. */
export const SpendingBucket = z.enum(["needs", "wants", "savings", "excluded"]);
export type SpendingBucket = z.infer<typeof SpendingBucket>;

export const SPENDING_BUCKET_LABEL: Record<SpendingBucket, string> = {
  needs: "Needs",
  wants: "Wants",
  savings: "Savings",
  excluded: "Not Spending",
};

export interface SpendingCategoryDef {
  /** Top level: `dining_out`. Subcategory: `dining_out.coffee`. */
  id: string;
  label: string;
  bucket: SpendingBucket;
  parentId: string | null;
}

/** The defaults, in display order. Subcategories inherit their parent's bucket. */
export const DEFAULT_SPENDING_CATEGORIES: readonly SpendingCategoryDef[] = [
  { id: "housing", label: "Housing", bucket: "needs", parentId: null },
  { id: "housing.rent", label: "Rent", bucket: "needs", parentId: "housing" },
  { id: "housing.mortgage", label: "Mortgage", bucket: "needs", parentId: "housing" },
  { id: "housing.repairs", label: "Repairs & Maintenance", bucket: "needs", parentId: "housing" },
  { id: "housing.storage", label: "Storage", bucket: "needs", parentId: "housing" },
  { id: "utilities", label: "Utilities", bucket: "needs", parentId: null },
  { id: "utilities.electricity_gas", label: "Electricity & Gas", bucket: "needs", parentId: "utilities" },
  { id: "utilities.water", label: "Water", bucket: "needs", parentId: "utilities" },
  { id: "utilities.sewage_trash", label: "Sewage & Trash", bucket: "needs", parentId: "utilities" },
  { id: "utilities.internet_cable", label: "Internet & Cable", bucket: "needs", parentId: "utilities" },
  { id: "utilities.phone", label: "Phone", bucket: "needs", parentId: "utilities" },
  { id: "utilities.other", label: "Other Utilities", bucket: "needs", parentId: "utilities" },
  { id: "groceries", label: "Groceries", bucket: "needs", parentId: null },
  { id: "groceries.groceries", label: "Groceries", bucket: "needs", parentId: "groceries" },
  { id: "transportation", label: "Transportation", bucket: "needs", parentId: null },
  { id: "transportation.gas", label: "Gas", bucket: "needs", parentId: "transportation" },
  { id: "transportation.public_transit", label: "Public Transit", bucket: "needs", parentId: "transportation" },
  { id: "transportation.parking", label: "Parking", bucket: "needs", parentId: "transportation" },
  { id: "transportation.tolls", label: "Tolls", bucket: "needs", parentId: "transportation" },
  { id: "transportation.car_maintenance", label: "Car Maintenance", bucket: "needs", parentId: "transportation" },
  { id: "transportation.other", label: "Other Transportation", bucket: "needs", parentId: "transportation" },
  { id: "insurance", label: "Insurance", bucket: "needs", parentId: null },
  { id: "insurance.insurance", label: "Insurance", bucket: "needs", parentId: "insurance" },
  { id: "health", label: "Health", bucket: "needs", parentId: null },
  { id: "health.primary_care", label: "Primary Care", bucket: "needs", parentId: "health" },
  { id: "health.dental", label: "Dental", bucket: "needs", parentId: "health" },
  { id: "health.eye_care", label: "Eye Care", bucket: "needs", parentId: "health" },
  { id: "health.pharmacy", label: "Pharmacy", bucket: "needs", parentId: "health" },
  { id: "health.nursing", label: "Nursing Care", bucket: "needs", parentId: "health" },
  { id: "health.other", label: "Other Health", bucket: "needs", parentId: "health" },
  { id: "childcare_education", label: "Childcare & Education", bucket: "needs", parentId: null },
  { id: "childcare_education.childcare", label: "Childcare", bucket: "needs", parentId: "childcare_education" },
  { id: "childcare_education.education", label: "Education", bucket: "needs", parentId: "childcare_education" },
  { id: "debt_payments", label: "Debt Payments", bucket: "needs", parentId: null },
  { id: "debt_payments.car", label: "Car Loan", bucket: "needs", parentId: "debt_payments" },
  { id: "debt_payments.student", label: "Student Loan", bucket: "needs", parentId: "debt_payments" },
  { id: "debt_payments.personal", label: "Personal Loan", bucket: "needs", parentId: "debt_payments" },
  { id: "debt_payments.bnpl", label: "Buy Now, Pay Later", bucket: "needs", parentId: "debt_payments" },
  { id: "debt_payments.other", label: "Other Debt", bucket: "needs", parentId: "debt_payments" },
  { id: "taxes_fees", label: "Taxes & Fees", bucket: "needs", parentId: null },
  { id: "taxes_fees.taxes", label: "Taxes", bucket: "needs", parentId: "taxes_fees" },
  { id: "taxes_fees.bank_fees", label: "Bank Fees", bucket: "needs", parentId: "taxes_fees" },
  { id: "taxes_fees.professional", label: "Accounting & Legal", bucket: "needs", parentId: "taxes_fees" },
  { id: "taxes_fees.government", label: "Government Services", bucket: "needs", parentId: "taxes_fees" },
  { id: "dining_out", label: "Dining Out", bucket: "wants", parentId: null },
  { id: "dining_out.restaurants", label: "Restaurants", bucket: "wants", parentId: "dining_out" },
  { id: "dining_out.fast_food", label: "Fast Food", bucket: "wants", parentId: "dining_out" },
  { id: "dining_out.coffee", label: "Coffee", bucket: "wants", parentId: "dining_out" },
  { id: "dining_out.bars_alcohol", label: "Bars & Alcohol", bucket: "wants", parentId: "dining_out" },
  { id: "dining_out.other", label: "Other Food & Drink", bucket: "wants", parentId: "dining_out" },
  { id: "entertainment", label: "Entertainment", bucket: "wants", parentId: null },
  { id: "entertainment.streaming", label: "Streaming", bucket: "wants", parentId: "entertainment" },
  { id: "entertainment.music", label: "Music & Audio", bucket: "wants", parentId: "entertainment" },
  { id: "entertainment.games", label: "Video Games", bucket: "wants", parentId: "entertainment" },
  { id: "entertainment.events", label: "Events & Attractions", bucket: "wants", parentId: "entertainment" },
  { id: "entertainment.gambling", label: "Gambling", bucket: "wants", parentId: "entertainment" },
  { id: "entertainment.other", label: "Other Entertainment", bucket: "wants", parentId: "entertainment" },
  { id: "shopping", label: "Shopping", bucket: "wants", parentId: null },
  { id: "shopping.clothing", label: "Clothing", bucket: "wants", parentId: "shopping" },
  { id: "shopping.electronics", label: "Electronics", bucket: "wants", parentId: "shopping" },
  { id: "shopping.online", label: "Online Marketplaces", bucket: "wants", parentId: "shopping" },
  { id: "shopping.department_stores", label: "Department Stores", bucket: "wants", parentId: "shopping" },
  { id: "shopping.superstores", label: "Superstores", bucket: "wants", parentId: "shopping" },
  { id: "shopping.discount_stores", label: "Discount Stores", bucket: "wants", parentId: "shopping" },
  { id: "shopping.convenience", label: "Convenience Stores", bucket: "wants", parentId: "shopping" },
  { id: "shopping.gifts", label: "Gifts", bucket: "wants", parentId: "shopping" },
  { id: "shopping.sporting_goods", label: "Sporting Goods", bucket: "wants", parentId: "shopping" },
  { id: "shopping.books", label: "Books", bucket: "wants", parentId: "shopping" },
  { id: "shopping.office_supplies", label: "Office Supplies", bucket: "wants", parentId: "shopping" },
  { id: "shopping.tobacco", label: "Tobacco & Vape", bucket: "wants", parentId: "shopping" },
  { id: "shopping.shipping", label: "Postage & Shipping", bucket: "wants", parentId: "shopping" },
  { id: "shopping.other", label: "Other Shopping", bucket: "wants", parentId: "shopping" },
  { id: "personal_care", label: "Personal Care", bucket: "wants", parentId: null },
  { id: "personal_care.gym", label: "Gym & Fitness", bucket: "wants", parentId: "personal_care" },
  { id: "personal_care.hair_beauty", label: "Hair & Beauty", bucket: "wants", parentId: "personal_care" },
  { id: "personal_care.laundry", label: "Laundry", bucket: "wants", parentId: "personal_care" },
  { id: "personal_care.other", label: "Other Personal Care", bucket: "wants", parentId: "personal_care" },
  { id: "travel", label: "Travel", bucket: "wants", parentId: null },
  { id: "travel.flights", label: "Flights", bucket: "wants", parentId: "travel" },
  { id: "travel.lodging", label: "Lodging", bucket: "wants", parentId: "travel" },
  { id: "travel.rental_cars", label: "Rental Cars", bucket: "wants", parentId: "travel" },
  { id: "travel.other", label: "Other Travel", bucket: "wants", parentId: "travel" },
  { id: "rides", label: "Rides", bucket: "wants", parentId: null },
  { id: "rides.taxis_rideshare", label: "Taxis & Rideshare", bucket: "wants", parentId: "rides" },
  { id: "rides.bikes_scooters", label: "Bikes & Scooters", bucket: "wants", parentId: "rides" },
  { id: "home_pets", label: "Home & Pets", bucket: "wants", parentId: null },
  { id: "home_pets.furniture", label: "Furniture", bucket: "wants", parentId: "home_pets" },
  { id: "home_pets.hardware", label: "Hardware", bucket: "wants", parentId: "home_pets" },
  { id: "home_pets.security", label: "Home Security", bucket: "wants", parentId: "home_pets" },
  { id: "home_pets.pet_supplies", label: "Pet Supplies", bucket: "wants", parentId: "home_pets" },
  { id: "home_pets.vet", label: "Vet", bucket: "wants", parentId: "home_pets" },
  { id: "home_pets.other", label: "Other Home", bucket: "wants", parentId: "home_pets" },
  { id: "giving", label: "Giving", bucket: "wants", parentId: null },
  { id: "giving.donations", label: "Donations", bucket: "wants", parentId: "giving" },
  { id: "other_spending", label: "Other", bucket: "wants", parentId: null },
  { id: "savings_investing", label: "Savings & Investing", bucket: "savings", parentId: null },
  { id: "savings_investing.savings", label: "Savings", bucket: "savings", parentId: "savings_investing" },
  { id: "savings_investing.investments", label: "Investments & Retirement", bucket: "savings", parentId: "savings_investing" },
  { id: "savings_investing.crypto", label: "Crypto", bucket: "savings", parentId: "savings_investing" },
  { id: "income", label: "Income", bucket: "excluded", parentId: null },
  { id: "transfers", label: "Transfers", bucket: "excluded", parentId: null },
  { id: "transfers.credit_card_payment", label: "Credit Card Payment", bucket: "excluded", parentId: "transfers" },
];

/** Plaid detailed category to a FinVantage category or subcategory. */
export const PLAID_DETAILED_CATEGORY: Readonly<Record<string, string>> = {
  ENTERTAINMENT_CASINOS_AND_GAMBLING: "entertainment.gambling",
  ENTERTAINMENT_MUSIC_AND_AUDIO: "entertainment.music",
  ENTERTAINMENT_OTHER_ENTERTAINMENT: "entertainment.other",
  ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS: "entertainment.events",
  ENTERTAINMENT_TV_AND_MOVIES: "entertainment.streaming",
  ENTERTAINMENT_VIDEO_GAMES: "entertainment.games",
  FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR: "dining_out.bars_alcohol",
  FOOD_AND_DRINK_COFFEE: "dining_out.coffee",
  FOOD_AND_DRINK_FAST_FOOD: "dining_out.fast_food",
  FOOD_AND_DRINK_GROCERIES: "groceries.groceries",
  FOOD_AND_DRINK_OTHER_FOOD_AND_DRINK: "dining_out.other",
  FOOD_AND_DRINK_RESTAURANT: "dining_out.restaurants",
  FOOD_AND_DRINK_VENDING_MACHINES: "dining_out.other",
  GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS: "shopping.books",
  GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES: "shopping.clothing",
  GENERAL_MERCHANDISE_CONVENIENCE_STORES: "shopping.convenience",
  GENERAL_MERCHANDISE_DEPARTMENT_STORES: "shopping.department_stores",
  GENERAL_MERCHANDISE_DISCOUNT_STORES: "shopping.discount_stores",
  GENERAL_MERCHANDISE_ELECTRONICS: "shopping.electronics",
  GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES: "shopping.gifts",
  GENERAL_MERCHANDISE_OFFICE_SUPPLIES: "shopping.office_supplies",
  GENERAL_MERCHANDISE_ONLINE_MARKETPLACES: "shopping.online",
  GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE: "shopping.other",
  GENERAL_MERCHANDISE_PET_SUPPLIES: "home_pets.pet_supplies",
  GENERAL_MERCHANDISE_SPORTING_GOODS: "shopping.sporting_goods",
  GENERAL_MERCHANDISE_SUPERSTORES: "shopping.superstores",
  GENERAL_MERCHANDISE_TOBACCO_AND_VAPE: "shopping.tobacco",
  GENERAL_SERVICES_ACCOUNTING_AND_FINANCIAL_PLANNING: "taxes_fees.professional",
  GENERAL_SERVICES_AUTOMOTIVE: "transportation.car_maintenance",
  GENERAL_SERVICES_CHILDCARE: "childcare_education.childcare",
  GENERAL_SERVICES_CONSULTING_AND_LEGAL: "taxes_fees.professional",
  GENERAL_SERVICES_EDUCATION: "childcare_education.education",
  GENERAL_SERVICES_INSURANCE: "insurance.insurance",
  GENERAL_SERVICES_OTHER_GENERAL_SERVICES: "other_spending",
  GENERAL_SERVICES_POSTAGE_AND_SHIPPING: "shopping.shipping",
  GENERAL_SERVICES_STORAGE: "housing.storage",
  GOVERNMENT_AND_NON_PROFIT_DONATIONS: "giving.donations",
  GOVERNMENT_AND_NON_PROFIT_GOVERNMENT_DEPARTMENTS_AND_AGENCIES: "taxes_fees.government",
  GOVERNMENT_AND_NON_PROFIT_OTHER_GOVERNMENT_AND_NON_PROFIT: "taxes_fees.government",
  GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT: "taxes_fees.taxes",
  HOME_IMPROVEMENT_FURNITURE: "home_pets.furniture",
  HOME_IMPROVEMENT_HARDWARE: "home_pets.hardware",
  HOME_IMPROVEMENT_OTHER_HOME_IMPROVEMENT: "home_pets.other",
  HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE: "housing.repairs",
  HOME_IMPROVEMENT_SECURITY: "home_pets.security",
  LOAN_PAYMENTS_BNPL: "debt_payments.bnpl",
  LOAN_PAYMENTS_CAR_PAYMENT: "debt_payments.car",
  LOAN_PAYMENTS_CASH_ADVANCES: "debt_payments.other",
  LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: "transfers.credit_card_payment",
  LOAN_PAYMENTS_EWA: "debt_payments.other",
  LOAN_PAYMENTS_MORTGAGE_PAYMENT: "housing.mortgage",
  LOAN_PAYMENTS_OTHER_PAYMENT: "debt_payments.other",
  LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT: "debt_payments.personal",
  LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT: "debt_payments.student",
  MEDICAL_DENTAL_CARE: "health.dental",
  MEDICAL_EYE_CARE: "health.eye_care",
  MEDICAL_NURSING_CARE: "health.nursing",
  MEDICAL_OTHER_MEDICAL: "health.other",
  MEDICAL_PHARMACIES_AND_SUPPLEMENTS: "health.pharmacy",
  MEDICAL_PRIMARY_CARE: "health.primary_care",
  MEDICAL_VETERINARY_SERVICES: "home_pets.vet",
  OTHER_OTHER: "other_spending",
  PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS: "personal_care.gym",
  PERSONAL_CARE_HAIR_AND_BEAUTY: "personal_care.hair_beauty",
  PERSONAL_CARE_LAUNDRY_AND_DRY_CLEANING: "personal_care.laundry",
  PERSONAL_CARE_OTHER_PERSONAL_CARE: "personal_care.other",
  RENT_AND_UTILITIES_GAS_AND_ELECTRICITY: "utilities.electricity_gas",
  RENT_AND_UTILITIES_INTERNET_AND_CABLE: "utilities.internet_cable",
  RENT_AND_UTILITIES_OTHER_UTILITIES: "utilities.other",
  RENT_AND_UTILITIES_RENT: "housing.rent",
  RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT: "utilities.sewage_trash",
  RENT_AND_UTILITIES_TELEPHONE: "utilities.phone",
  RENT_AND_UTILITIES_WATER: "utilities.water",
  TRANSFER_OUT_CRYPTO: "savings_investing.crypto",
  TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS: "savings_investing.investments",
  TRANSFER_OUT_SAVINGS: "savings_investing.savings",
  TRANSPORTATION_BIKES_AND_SCOOTERS: "rides.bikes_scooters",
  TRANSPORTATION_GAS: "transportation.gas",
  TRANSPORTATION_OTHER_TRANSPORTATION: "transportation.other",
  TRANSPORTATION_PARKING: "transportation.parking",
  TRANSPORTATION_PUBLIC_TRANSIT: "transportation.public_transit",
  TRANSPORTATION_TAXIS_AND_RIDE_SHARES: "rides.taxis_rideshare",
  TRANSPORTATION_TOLLS: "transportation.tolls",
  TRAVEL_FLIGHTS: "travel.flights",
  TRAVEL_LODGING: "travel.lodging",
  TRAVEL_OTHER_TRAVEL: "travel.other",
  TRAVEL_RENTAL_CARS: "travel.rental_cars",
};

/** Fallback by Plaid primary category, for detailed categories not listed above. */
export const PLAID_PRIMARY_CATEGORY: Readonly<Record<string, string>> = {
  BANK_FEES: "taxes_fees.bank_fees",
  ENTERTAINMENT: "entertainment",
  FOOD_AND_DRINK: "dining_out",
  GENERAL_MERCHANDISE: "shopping",
  GENERAL_SERVICES: "other_spending",
  GOVERNMENT_AND_NON_PROFIT: "taxes_fees",
  HOME_IMPROVEMENT: "home_pets",
  INCOME: "income",
  LOAN_DISBURSEMENTS: "transfers",
  LOAN_PAYMENTS: "debt_payments",
  MEDICAL: "health",
  OTHER: "other_spending",
  PERSONAL_CARE: "personal_care",
  RENT_AND_UTILITIES: "utilities",
  TRANSFER_IN: "transfers",
  TRANSFER_OUT: "transfers",
  TRANSPORTATION: "transportation",
  TRAVEL: "travel",
};

/** Every Plaid detailed category in v2 and v1, so tests can prove each one maps. */
export const PLAID_DETAILED_CATEGORIES: readonly { primary: string; detailed: string }[] = [
  { primary: "BANK_FEES", detailed: "BANK_FEES_ATM_FEES" },
  { primary: "BANK_FEES", detailed: "BANK_FEES_CASH_ADVANCE" },
  { primary: "BANK_FEES", detailed: "BANK_FEES_FOREIGN_TRANSACTION_FEES" },
  { primary: "BANK_FEES", detailed: "BANK_FEES_INSUFFICIENT_FUNDS" },
  { primary: "BANK_FEES", detailed: "BANK_FEES_INTEREST_CHARGE" },
  { primary: "BANK_FEES", detailed: "BANK_FEES_LATE_FEES" },
  { primary: "BANK_FEES", detailed: "BANK_FEES_OTHER_BANK_FEES" },
  { primary: "BANK_FEES", detailed: "BANK_FEES_OVERDRAFT_FEES" },
  { primary: "ENTERTAINMENT", detailed: "ENTERTAINMENT_CASINOS_AND_GAMBLING" },
  { primary: "ENTERTAINMENT", detailed: "ENTERTAINMENT_MUSIC_AND_AUDIO" },
  { primary: "ENTERTAINMENT", detailed: "ENTERTAINMENT_OTHER_ENTERTAINMENT" },
  { primary: "ENTERTAINMENT", detailed: "ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS" },
  { primary: "ENTERTAINMENT", detailed: "ENTERTAINMENT_TV_AND_MOVIES" },
  { primary: "ENTERTAINMENT", detailed: "ENTERTAINMENT_VIDEO_GAMES" },
  { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR" },
  { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_COFFEE" },
  { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_FAST_FOOD" },
  { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_GROCERIES" },
  { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_OTHER_FOOD_AND_DRINK" },
  { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_RESTAURANT" },
  { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_VENDING_MACHINES" },
  { primary: "GENERAL_MERCHANDISE", detailed: "GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS" },
  { primary: "GENERAL_MERCHANDISE", detailed: "GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES" },
  { primary: "GENERAL_MERCHANDISE", detailed: "GENERAL_MERCHANDISE_CONVENIENCE_STORES" },
  { primary: "GENERAL_MERCHANDISE", detailed: "GENERAL_MERCHANDISE_DEPARTMENT_STORES" },
  { primary: "GENERAL_MERCHANDISE", detailed: "GENERAL_MERCHANDISE_DISCOUNT_STORES" },
  { primary: "GENERAL_MERCHANDISE", detailed: "GENERAL_MERCHANDISE_ELECTRONICS" },
  { primary: "GENERAL_MERCHANDISE", detailed: "GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES" },
  { primary: "GENERAL_MERCHANDISE", detailed: "GENERAL_MERCHANDISE_OFFICE_SUPPLIES" },
  { primary: "GENERAL_MERCHANDISE", detailed: "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES" },
  { primary: "GENERAL_MERCHANDISE", detailed: "GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE" },
  { primary: "GENERAL_MERCHANDISE", detailed: "GENERAL_MERCHANDISE_PET_SUPPLIES" },
  { primary: "GENERAL_MERCHANDISE", detailed: "GENERAL_MERCHANDISE_SPORTING_GOODS" },
  { primary: "GENERAL_MERCHANDISE", detailed: "GENERAL_MERCHANDISE_SUPERSTORES" },
  { primary: "GENERAL_MERCHANDISE", detailed: "GENERAL_MERCHANDISE_TOBACCO_AND_VAPE" },
  { primary: "GENERAL_SERVICES", detailed: "GENERAL_SERVICES_ACCOUNTING_AND_FINANCIAL_PLANNING" },
  { primary: "GENERAL_SERVICES", detailed: "GENERAL_SERVICES_AUTOMOTIVE" },
  { primary: "GENERAL_SERVICES", detailed: "GENERAL_SERVICES_CHILDCARE" },
  { primary: "GENERAL_SERVICES", detailed: "GENERAL_SERVICES_CONSULTING_AND_LEGAL" },
  { primary: "GENERAL_SERVICES", detailed: "GENERAL_SERVICES_EDUCATION" },
  { primary: "GENERAL_SERVICES", detailed: "GENERAL_SERVICES_INSURANCE" },
  { primary: "GENERAL_SERVICES", detailed: "GENERAL_SERVICES_OTHER_GENERAL_SERVICES" },
  { primary: "GENERAL_SERVICES", detailed: "GENERAL_SERVICES_POSTAGE_AND_SHIPPING" },
  { primary: "GENERAL_SERVICES", detailed: "GENERAL_SERVICES_STORAGE" },
  { primary: "GOVERNMENT_AND_NON_PROFIT", detailed: "GOVERNMENT_AND_NON_PROFIT_DONATIONS" },
  { primary: "GOVERNMENT_AND_NON_PROFIT", detailed: "GOVERNMENT_AND_NON_PROFIT_GOVERNMENT_DEPARTMENTS_AND_AGENCIES" },
  { primary: "GOVERNMENT_AND_NON_PROFIT", detailed: "GOVERNMENT_AND_NON_PROFIT_OTHER_GOVERNMENT_AND_NON_PROFIT" },
  { primary: "GOVERNMENT_AND_NON_PROFIT", detailed: "GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT" },
  { primary: "HOME_IMPROVEMENT", detailed: "HOME_IMPROVEMENT_FURNITURE" },
  { primary: "HOME_IMPROVEMENT", detailed: "HOME_IMPROVEMENT_HARDWARE" },
  { primary: "HOME_IMPROVEMENT", detailed: "HOME_IMPROVEMENT_OTHER_HOME_IMPROVEMENT" },
  { primary: "HOME_IMPROVEMENT", detailed: "HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE" },
  { primary: "HOME_IMPROVEMENT", detailed: "HOME_IMPROVEMENT_SECURITY" },
  { primary: "INCOME", detailed: "INCOME_CHILD_SUPPORT" },
  { primary: "INCOME", detailed: "INCOME_CONTRACTOR" },
  { primary: "INCOME", detailed: "INCOME_DIVIDENDS" },
  { primary: "INCOME", detailed: "INCOME_GIG_ECONOMY" },
  { primary: "INCOME", detailed: "INCOME_INTEREST_EARNED" },
  { primary: "INCOME", detailed: "INCOME_LONG_TERM_DISABILITY" },
  { primary: "INCOME", detailed: "INCOME_MILITARY" },
  { primary: "INCOME", detailed: "INCOME_OTHER" },
  { primary: "INCOME", detailed: "INCOME_OTHER_INCOME" },
  { primary: "INCOME", detailed: "INCOME_RENTAL" },
  { primary: "INCOME", detailed: "INCOME_RETIREMENT_PENSION" },
  { primary: "INCOME", detailed: "INCOME_SALARY" },
  { primary: "INCOME", detailed: "INCOME_TAX_REFUND" },
  { primary: "INCOME", detailed: "INCOME_UNEMPLOYMENT" },
  { primary: "INCOME", detailed: "INCOME_WAGES" },
  { primary: "LOAN_DISBURSEMENTS", detailed: "LOAN_DISBURSEMENTS_AUTO" },
  { primary: "LOAN_DISBURSEMENTS", detailed: "LOAN_DISBURSEMENTS_CASH_ADVANCES" },
  { primary: "LOAN_DISBURSEMENTS", detailed: "LOAN_DISBURSEMENTS_EWA" },
  { primary: "LOAN_DISBURSEMENTS", detailed: "LOAN_DISBURSEMENTS_MORTGAGE" },
  { primary: "LOAN_DISBURSEMENTS", detailed: "LOAN_DISBURSEMENTS_OTHER_DISBURSEMENT" },
  { primary: "LOAN_DISBURSEMENTS", detailed: "LOAN_DISBURSEMENTS_PERSONAL" },
  { primary: "LOAN_DISBURSEMENTS", detailed: "LOAN_DISBURSEMENTS_STUDENT" },
  { primary: "LOAN_PAYMENTS", detailed: "LOAN_PAYMENTS_BNPL" },
  { primary: "LOAN_PAYMENTS", detailed: "LOAN_PAYMENTS_CAR_PAYMENT" },
  { primary: "LOAN_PAYMENTS", detailed: "LOAN_PAYMENTS_CASH_ADVANCES" },
  { primary: "LOAN_PAYMENTS", detailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" },
  { primary: "LOAN_PAYMENTS", detailed: "LOAN_PAYMENTS_EWA" },
  { primary: "LOAN_PAYMENTS", detailed: "LOAN_PAYMENTS_MORTGAGE_PAYMENT" },
  { primary: "LOAN_PAYMENTS", detailed: "LOAN_PAYMENTS_OTHER_PAYMENT" },
  { primary: "LOAN_PAYMENTS", detailed: "LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT" },
  { primary: "LOAN_PAYMENTS", detailed: "LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT" },
  { primary: "MEDICAL", detailed: "MEDICAL_DENTAL_CARE" },
  { primary: "MEDICAL", detailed: "MEDICAL_EYE_CARE" },
  { primary: "MEDICAL", detailed: "MEDICAL_NURSING_CARE" },
  { primary: "MEDICAL", detailed: "MEDICAL_OTHER_MEDICAL" },
  { primary: "MEDICAL", detailed: "MEDICAL_PHARMACIES_AND_SUPPLEMENTS" },
  { primary: "MEDICAL", detailed: "MEDICAL_PRIMARY_CARE" },
  { primary: "MEDICAL", detailed: "MEDICAL_VETERINARY_SERVICES" },
  { primary: "OTHER", detailed: "OTHER_OTHER" },
  { primary: "PERSONAL_CARE", detailed: "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS" },
  { primary: "PERSONAL_CARE", detailed: "PERSONAL_CARE_HAIR_AND_BEAUTY" },
  { primary: "PERSONAL_CARE", detailed: "PERSONAL_CARE_LAUNDRY_AND_DRY_CLEANING" },
  { primary: "PERSONAL_CARE", detailed: "PERSONAL_CARE_OTHER_PERSONAL_CARE" },
  { primary: "RENT_AND_UTILITIES", detailed: "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY" },
  { primary: "RENT_AND_UTILITIES", detailed: "RENT_AND_UTILITIES_INTERNET_AND_CABLE" },
  { primary: "RENT_AND_UTILITIES", detailed: "RENT_AND_UTILITIES_OTHER_UTILITIES" },
  { primary: "RENT_AND_UTILITIES", detailed: "RENT_AND_UTILITIES_RENT" },
  { primary: "RENT_AND_UTILITIES", detailed: "RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT" },
  { primary: "RENT_AND_UTILITIES", detailed: "RENT_AND_UTILITIES_TELEPHONE" },
  { primary: "RENT_AND_UTILITIES", detailed: "RENT_AND_UTILITIES_WATER" },
  { primary: "TRANSFER_IN", detailed: "TRANSFER_IN_ACCOUNT_TRANSFER" },
  { primary: "TRANSFER_IN", detailed: "TRANSFER_IN_CASH_ADVANCES_AND_LOANS" },
  { primary: "TRANSFER_IN", detailed: "TRANSFER_IN_DEPOSIT" },
  { primary: "TRANSFER_IN", detailed: "TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS" },
  { primary: "TRANSFER_IN", detailed: "TRANSFER_IN_OTHER_TRANSFER_IN" },
  { primary: "TRANSFER_IN", detailed: "TRANSFER_IN_SAVINGS" },
  { primary: "TRANSFER_IN", detailed: "TRANSFER_IN_TRANSFER_IN_FROM_APPS" },
  { primary: "TRANSFER_IN", detailed: "TRANSFER_IN_WIRE" },
  { primary: "TRANSFER_OUT", detailed: "TRANSFER_OUT_ACCOUNT_TRANSFER" },
  { primary: "TRANSFER_OUT", detailed: "TRANSFER_OUT_CRYPTO" },
  { primary: "TRANSFER_OUT", detailed: "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS" },
  { primary: "TRANSFER_OUT", detailed: "TRANSFER_OUT_OTHER_TRANSFER_OUT" },
  { primary: "TRANSFER_OUT", detailed: "TRANSFER_OUT_SAVINGS" },
  { primary: "TRANSFER_OUT", detailed: "TRANSFER_OUT_TRANSFER_OUT_FROM_APPS" },
  { primary: "TRANSFER_OUT", detailed: "TRANSFER_OUT_WIRE" },
  { primary: "TRANSFER_OUT", detailed: "TRANSFER_OUT_WITHDRAWAL" },
  { primary: "TRANSPORTATION", detailed: "TRANSPORTATION_BIKES_AND_SCOOTERS" },
  { primary: "TRANSPORTATION", detailed: "TRANSPORTATION_GAS" },
  { primary: "TRANSPORTATION", detailed: "TRANSPORTATION_OTHER_TRANSPORTATION" },
  { primary: "TRANSPORTATION", detailed: "TRANSPORTATION_PARKING" },
  { primary: "TRANSPORTATION", detailed: "TRANSPORTATION_PUBLIC_TRANSIT" },
  { primary: "TRANSPORTATION", detailed: "TRANSPORTATION_TAXIS_AND_RIDE_SHARES" },
  { primary: "TRANSPORTATION", detailed: "TRANSPORTATION_TOLLS" },
  { primary: "TRAVEL", detailed: "TRAVEL_FLIGHTS" },
  { primary: "TRAVEL", detailed: "TRAVEL_LODGING" },
  { primary: "TRAVEL", detailed: "TRAVEL_OTHER_TRAVEL" },
  { primary: "TRAVEL", detailed: "TRAVEL_RENTAL_CARS" },
];

const BY_ID = new Map(DEFAULT_SPENDING_CATEGORIES.map((c) => [c.id, c]));

/** Category ids used before 2026-11-08, still in stored data. Read them as the current ids. */
const LEGACY_CATEGORY_ID: Readonly<Record<string, string>> = {
  dining: "dining_out",
  subscriptions: "entertainment",
  transport: "transportation",
  debt: "debt_payments",
  fees: "taxes_fees",
  transfer: "transfers",
  home: "home_pets",
  services: "other_spending",
};

/** The current id for a category id, translating ids from before the category redesign. */
export function canonicalCategoryId(id: string): string {
  return LEGACY_CATEGORY_ID[id] ?? id;
}

/** The top-level category of any id: `dining_out.coffee` becomes `dining_out`. */
export function topCategoryId(id: string): string {
  return id.split(".")[0]!;
}

/** Plaid's category as FinVantage's top-level category and most specific subcategory. */
export function categorizePlaid(
  pfc: { primary: string; detailed: string } | null,
): { category: string | null; subcategory: string | null } {
  const id = pfc ? (PLAID_DETAILED_CATEGORY[pfc.detailed] ?? PLAID_PRIMARY_CATEGORY[pfc.primary]) : undefined;
  if (!id) return { category: null, subcategory: null };
  return { category: topCategoryId(id), subcategory: id.includes(".") ? id : null };
}

/** The display name for a category or subcategory id. Unknown ids are shown as they are. */
export function categoryLabel(id: string | null): string {
  if (!id) return "Uncategorized";
  return BY_ID.get(canonicalCategoryId(id))?.label ?? id;
}

/** The default bucket for a category or subcategory id, from its top-level category. */
export function categoryBucket(id: string | null): SpendingBucket | null {
  if (!id) return null;
  return BY_ID.get(topCategoryId(canonicalCategoryId(id)))?.bucket ?? null;
}

/** Shares of monthly income for Needs, Wants and Savings. They must add up to 100%. */
export const SpendingSplit = z
  .object({
    needs: z.number().min(0).max(1),
    wants: z.number().min(0).max(1),
    savings: z.number().min(0).max(1),
  })
  .refine((s) => Math.abs(s.needs + s.wants + s.savings - 1) < 0.0001, {
    message: "Needs, Wants and Savings must add up to 100%.",
  });
export type SpendingSplit = z.infer<typeof SpendingSplit>;

/** The 50/30/20 rule. */
export const DEFAULT_SPENDING_SPLIT: SpendingSplit = { needs: 0.5, wants: 0.3, savings: 0.2 };

export const BudgetedBucket = SpendingBucket.exclude(["excluded"]);
export type BudgetedBucket = z.infer<typeof BudgetedBucket>;

/** This month's spending in each bucket against the user's split. */
export const BucketSummary = z.object({
  month: z.string(),
  incomeCents: Cents,
  split: SpendingSplit,
  buckets: z.array(
    z.object({
      bucket: BudgetedBucket,
      spentCents: Cents,
      targetCents: Cents,
      /** Spending as a share of income: 0.42 means 42%. */
      shareOfIncome: z.number(),
    }),
  ),
  /** Money out with no category yet, so it is in no bucket. */
  uncategorizedCents: Cents,
});
export type BucketSummary = z.infer<typeof BucketSummary>;

/** A category as the API returns it. Custom categories arrive with the build-order step 3. */
export const SpendingCategory = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  bucket: SpendingBucket,
  parentId: z.string().nullable(),
});
export type SpendingCategory = z.infer<typeof SpendingCategory>;
