import {
  Baby, BedDouble, Bike, BookOpen, Briefcase, Building2, Bitcoin, CalendarClock, Car, CarTaxiFront, CircleEllipsis,
  Clapperboard, Coffee, CreditCard, Cigarette, Dices, Droplets, Dumbbell, Eye, Fuel, Gamepad2, Gift, GraduationCap,
  Hammer, HandCoins, HandHeart, HeartHandshake, HeartPulse, Home, KeyRound, Landmark, Laptop, Lock, Milestone, Music,
  Package, PawPrint, PenLine, Pill, PiggyBank, Plane, Receipt, Sandwich, Scissors, ShieldCheck, Shirt, ShoppingBag,
  ShoppingBasket, Smartphone, Smile, Sofa, Sparkles, SquareParking, Stethoscope, Store, Tag, Tags, Ticket, TrainFront,
  Trash2, TrendingUp, Truck, Tv, UtensilsCrossed, Wallet, ArrowLeftRight, Warehouse, WashingMachine, Wifi, Wine, Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { canonicalCategoryId, parentCategoryId } from "@finvantage/contracts";

/**
 * One icon per default category and subcategory. A category the user made has no entry and takes
 * its nearest parent's icon, so Shopping → Superstores → Walmart shows the Superstores icon.
 */
const ICONS: Record<string, LucideIcon> = {
  // Needs
  housing: Home, "housing.rent": KeyRound, "housing.mortgage": Landmark, "housing.repairs": Wrench, "housing.storage": Warehouse,
  utilities: Zap, "utilities.electricity_gas": Zap, "utilities.water": Droplets, "utilities.sewage_trash": Trash2,
  "utilities.internet_cable": Wifi, "utilities.phone": Smartphone, "utilities.other": Zap,
  groceries: ShoppingBasket, "groceries.groceries": ShoppingBasket,
  transportation: Car, "transportation.gas": Fuel, "transportation.public_transit": TrainFront, "transportation.parking": SquareParking,
  "transportation.tolls": Milestone, "transportation.car_maintenance": Wrench, "transportation.other": Car,
  insurance: ShieldCheck, "insurance.insurance": ShieldCheck,
  health: HeartPulse, "health.primary_care": Stethoscope, "health.dental": Smile, "health.eye_care": Eye, "health.pharmacy": Pill,
  "health.nursing": HeartHandshake, "health.other": HeartPulse,
  childcare_education: GraduationCap, "childcare_education.childcare": Baby, "childcare_education.education": GraduationCap,
  debt_payments: CreditCard, "debt_payments.car": Car, "debt_payments.student": GraduationCap, "debt_payments.personal": HandCoins,
  "debt_payments.bnpl": CalendarClock, "debt_payments.other": CreditCard,
  taxes_fees: Receipt, "taxes_fees.taxes": Receipt, "taxes_fees.bank_fees": Landmark, "taxes_fees.professional": Briefcase,
  "taxes_fees.government": Building2,
  // Wants
  dining_out: UtensilsCrossed, "dining_out.restaurants": UtensilsCrossed, "dining_out.fast_food": Sandwich, "dining_out.coffee": Coffee,
  "dining_out.bars_alcohol": Wine, "dining_out.other": UtensilsCrossed,
  entertainment: Clapperboard, "entertainment.streaming": Tv, "entertainment.music": Music, "entertainment.games": Gamepad2,
  "entertainment.events": Ticket, "entertainment.gambling": Dices, "entertainment.other": Clapperboard,
  shopping: ShoppingBag, "shopping.clothing": Shirt, "shopping.electronics": Laptop, "shopping.online": Package,
  "shopping.department_stores": Store, "shopping.superstores": Warehouse, "shopping.discount_stores": Tags,
  "shopping.convenience": Store, "shopping.gifts": Gift, "shopping.sporting_goods": Dumbbell, "shopping.books": BookOpen,
  "shopping.office_supplies": PenLine, "shopping.tobacco": Cigarette, "shopping.shipping": Truck, "shopping.other": ShoppingBag,
  personal_care: Sparkles, "personal_care.gym": Dumbbell, "personal_care.hair_beauty": Scissors, "personal_care.laundry": WashingMachine,
  "personal_care.other": Sparkles,
  travel: Plane, "travel.flights": Plane, "travel.lodging": BedDouble, "travel.rental_cars": Car, "travel.other": Plane,
  rides: CarTaxiFront, "rides.taxis_rideshare": CarTaxiFront, "rides.bikes_scooters": Bike,
  home_pets: Sofa, "home_pets.furniture": Sofa, "home_pets.hardware": Hammer, "home_pets.security": Lock,
  "home_pets.pet_supplies": PawPrint, "home_pets.vet": PawPrint, "home_pets.other": Sofa,
  giving: HandHeart, "giving.donations": HandHeart,
  other_spending: CircleEllipsis,
  // Savings
  savings_investing: PiggyBank, "savings_investing.savings": PiggyBank, "savings_investing.investments": TrendingUp,
  "savings_investing.crypto": Bitcoin,
  // Not spending
  income: Wallet, transfers: ArrowLeftRight, "transfers.credit_card_payment": CreditCard,
};

/** The icon for a category id. Walks up through parents, then falls back to a plain tag. */
export function iconForCategory(id: string | null | undefined): LucideIcon {
  for (let cur = id ? canonicalCategoryId(id) : null; cur; cur = parentCategoryId(cur)) {
    const icon = ICONS[cur];
    if (icon) return icon;
  }
  return Tag;
}

/** A category's icon in a soft rounded tile, for lists. `bare` drops the tile. */
export function CategoryIcon({
  id,
  size = 16,
  bare = false,
  className = "",
}: {
  id: string | null | undefined;
  size?: number;
  bare?: boolean;
  className?: string;
}) {
  const Icon = iconForCategory(id);
  const icon = <Icon size={size} strokeWidth={2} aria-hidden="true" />;
  if (bare) return <span className={`inline-flex shrink-0 ${className}`} style={{ color: "var(--accent)" }}>{icon}</span>;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl ${className}`}
      style={{ width: size + 16, height: size + 16, background: "var(--accent-soft)", color: "var(--accent)" }}
    >
      {icon}
    </span>
  );
}
