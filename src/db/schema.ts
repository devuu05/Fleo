import {
  pgTable, serial, text, integer, boolean, timestamp, real, jsonb, index, uniqueIndex,
} from "drizzle-orm/pg-core";

export const routes = pgTable(
  "routes",
  {
    id: serial("id").primaryKey(),
    origin: text("origin").notNull(),
    destination: text("destination").notNull(),
    destinationCity: text("destination_city").notNull(),
    destinationCountry: text("destination_country").notNull(),
    active: boolean("active").notNull().default(true),
  },
  (t) => [uniqueIndex("routes_od_idx").on(t.origin, t.destination)],
);

export const priceSnapshots = pgTable(
  "price_snapshots",
  {
    id: serial("id").primaryKey(),
    routeId: integer("route_id").notNull().references(() => routes.id),
    cabin: text("cabin").notNull(), // economy | business
    departDate: text("depart_date").notNull(), // YYYY-MM-DD
    departMonth: text("depart_month").notNull(), // YYYY-MM
    returnDate: text("return_date"),
    priceInr: integer("price_inr").notNull(),
    airline: text("airline"),
    stops: integer("stops").notNull().default(0),
    durationMinutes: integer("duration_minutes"),
    transitCountries: jsonb("transit_countries").$type<string[] | null>(), // null = unknown
    deepLink: text("deep_link"),
    source: text("source").notNull(), // sample | travelpayouts
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("snap_baseline_idx").on(t.routeId, t.departMonth, t.cabin, t.fetchedAt),
  ],
);

export const deals = pgTable(
  "deals",
  {
    id: serial("id").primaryKey(),
    routeId: integer("route_id").notNull().references(() => routes.id),
    cabin: text("cabin").notNull(),
    departDate: text("depart_date").notNull(),
    departMonth: text("depart_month").notNull(),
    returnDate: text("return_date").notNull().default(""), // "" = one-way (keeps the unique index NULL-free)
    priceInr: integer("price_inr").notNull(),
    baselineInr: integer("baseline_inr").notNull(),
    pctBelow: real("pct_below").notNull(),
    savingsInr: integer("savings_inr").notNull(),
    airline: text("airline"),
    stops: integer("stops").notNull(),
    durationMinutes: integer("duration_minutes"),
    isErrorFare: boolean("is_error_fare").notNull().default(false),
    visaWarnings: jsonb("visa_warnings").$type<{ country: string; note: string }[]>().notNull().default([]),
    deepLink: text("deep_link"),
    source: text("source").notNull(),
    foundAt: timestamp("found_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("deals_found_idx").on(t.foundAt),
    // one live deal per route + dates + cabin; a price drop updates it (and re-posts)
    uniqueIndex("deals_unique_idx").on(t.routeId, t.cabin, t.departDate, t.returnDate),
  ],
);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  isPremium: boolean("is_premium").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const transitRules = pgTable("transit_rules", {
  id: serial("id").primaryKey(),
  countryCode: text("country_code").notNull().unique(),
  countryName: text("country_name").notNull(),
  note: text("note").notNull(),
  verified: boolean("verified").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Route = typeof routes.$inferSelect;
export type Snapshot = typeof priceSnapshots.$inferSelect;
export type DealRow = typeof deals.$inferSelect;
export type TransitRule = typeof transitRules.$inferSelect;
