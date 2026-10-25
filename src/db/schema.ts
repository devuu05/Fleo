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
    observedAt: timestamp("observed_at", { withTimezone: true }), // when a real user last saw this price (null = unknown)
    gate: text("gate"),
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
    observedAt: timestamp("observed_at", { withTimezone: true }),
    gate: text("gate"),
    source: text("source").notNull(),
    status: text("status").notNull().default("published"), // pending | published | rejected
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
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
  authId: text("auth_id").unique(), // Supabase auth.users.id (null for dev-mode users)
  isPremium: boolean("is_premium").notNull().default(false),
  premiumUntil: timestamp("premium_until", { withTimezone: true }), // null + isPremium = manual/lifetime grant
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

export const userPreferences = pgTable("user_preferences", {
  userId: integer("user_id").primaryKey().references(() => users.id),
  origins: jsonb("origins").$type<string[]>().notNull().default([]), // [] = any
  destinations: jsonb("destinations").$type<string[]>().notNull().default([]),
  cabins: jsonb("cabins").$type<string[]>().notNull().default([]),
  alertsEmail: boolean("alerts_email").notNull().default(true),
  whatsappNumber: text("whatsapp_number"), // stored for the WhatsApp phase; not used yet
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Outbox: every alert we decide to send, once per (user, deal, channel, price).
export const alerts = pgTable(
  "alerts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    dealId: integer("deal_id").notNull().references(() => deals.id),
    channel: text("channel").notNull(), // email | whatsapp | push
    priceInr: integer("price_inr").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: text("status").notNull(), // sent | logged (no provider configured) | failed
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("alerts_once_idx").on(t.userId, t.dealId, t.channel, t.priceInr)],
);

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  provider: text("provider").notNull(), // razorpay | test
  orderId: text("order_id").notNull().unique(),
  paymentId: text("payment_id"),
  amountInr: integer("amount_inr").notNull(),
  status: text("status").notNull().default("created"), // created | paid
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
});
