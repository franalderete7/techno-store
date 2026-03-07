-- ============================================================
-- STOCK MANAGEMENT SYSTEM - Run in Supabase SQL Editor
-- ============================================================

-- 1. Status enums
CREATE TYPE stock_status AS ENUM (
  'in_stock',
  'reserved',
  'sold',
  'warranty',
  'returned'
);

CREATE TYPE sale_status AS ENUM (
  'incomplete',
  'confirmed',
  'cancelled'
);

CREATE TYPE payment_status AS ENUM (
  'pending',
  'paid',
  'partial'
);

CREATE TYPE reservation_status AS ENUM (
  'interested',
  'pending_deposit',
  'deposit_paid',
  'cancelled',
  'delivered'
);

CREATE TYPE payment_method AS ENUM (
  'transferencia',
  'efectivo_ars',
  'efectivo_usd',
  'crypto',
  'tarjeta',
  'cuotas_bancarizada',
  'cuotas_macro',
  'otro'
);

CREATE TYPE error_severity AS ENUM ('low', 'medium', 'high');

-- ============================================================
-- 2. Purchases (orders from suppliers)
-- ============================================================
CREATE SEQUENCE purchase_id_seq START 1;

CREATE TABLE purchases (
  id serial PRIMARY KEY,
  purchase_id text NOT NULL UNIQUE,
  date_purchase date NOT NULL DEFAULT CURRENT_DATE,
  supplier_name text NOT NULL,
  payment_method payment_method DEFAULT 'transferencia',
  payment_status payment_status DEFAULT 'pending',
  total_cost numeric(12, 2),
  currency text DEFAULT 'USD' CHECK (currency IN ('ARS', 'USD')),
  notes text,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_purchases_supplier ON purchases(supplier_name);
CREATE INDEX idx_purchases_date ON purchases(date_purchase DESC);

CREATE OR REPLACE FUNCTION generate_purchase_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.purchase_id := 'PUR-' || EXTRACT(YEAR FROM CURRENT_DATE)::text
    || '-' || LPAD(nextval('purchase_id_seq')::text, 5, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generate_purchase_id
  BEFORE INSERT ON purchases
  FOR EACH ROW EXECUTE FUNCTION generate_purchase_id();

CREATE TRIGGER trg_purchases_updated
  BEFORE UPDATE ON purchases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 3. Stock Units (1 row = 1 physical phone with IMEI)
-- ============================================================
CREATE TABLE stock_units (
  id serial PRIMARY KEY,
  imei1 text NOT NULL UNIQUE,
  imei2 text,
  product_key text NOT NULL REFERENCES products(product_key),
  purchase_id text REFERENCES purchases(purchase_id),
  supplier_name text,
  cost_unit numeric(10, 2),
  cost_currency text DEFAULT 'USD' CHECK (cost_currency IN ('ARS', 'USD')),
  date_received date,
  status stock_status NOT NULL DEFAULT 'in_stock',
  -- Reservation fields
  reserved_for_phone text,
  reserved_for_customer_id integer REFERENCES customers(id),
  reserved_until timestamptz,
  reservation_id integer,
  -- Sale fields
  sale_id integer,
  date_sold date,
  price_sold numeric(12, 2),
  -- Metadata
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  -- IMEI1 validation: exactly 15 digits
  CONSTRAINT valid_imei1 CHECK (imei1 ~ '^\d{15}$'),
  CONSTRAINT valid_imei2 CHECK (imei2 IS NULL OR imei2 ~ '^\d{15}$')
);

CREATE INDEX idx_stock_units_product_key ON stock_units(product_key);
CREATE INDEX idx_stock_units_status ON stock_units(status);
CREATE INDEX idx_stock_units_purchase_id ON stock_units(purchase_id);
CREATE INDEX idx_stock_units_sale_id ON stock_units(sale_id);
CREATE INDEX idx_stock_units_date_sold ON stock_units(date_sold DESC);
CREATE INDEX idx_stock_units_reserved_customer ON stock_units(reserved_for_customer_id);

CREATE TRIGGER trg_stock_units_updated
  BEFORE UPDATE ON stock_units
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION sync_stock_unit_sale_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.date_sold IS NULL AND OLD.date_sold IS NOT NULL THEN
    NEW.date_sold := OLD.date_sold;
  END IF;

  IF NEW.status = 'sold' AND NEW.date_sold IS NULL THEN
    NEW.date_sold := CURRENT_DATE;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_stock_units_sale_fields
  BEFORE INSERT OR UPDATE OF status, date_sold ON stock_units
  FOR EACH ROW EXECUTE FUNCTION sync_stock_unit_sale_fields();

-- ============================================================
-- 4. Sales (sales to customers)
-- ============================================================
CREATE TABLE sales (
  id serial PRIMARY KEY,
  date_sale date NOT NULL DEFAULT CURRENT_DATE,
  customer_id integer REFERENCES customers(id),
  customer_name text,
  customer_phone text,
  customer_dni text,
  payment_method payment_method DEFAULT 'transferencia',
  amount_total numeric(12, 2),
  currency text DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),
  seller text,
  channel text DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'presencial', 'web', 'otro')),
  status sale_status NOT NULL DEFAULT 'incomplete',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_sales_customer_id ON sales(customer_id);
CREATE INDEX idx_sales_date ON sales(date_sale DESC);
CREATE INDEX idx_sales_status ON sales(status);

CREATE TRIGGER trg_sales_updated
  BEFORE UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 5. Sale Items (links sale to stock units by IMEI)
-- ============================================================
CREATE TABLE sale_items (
  id serial PRIMARY KEY,
  sale_id integer NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  stock_unit_id integer NOT NULL REFERENCES stock_units(id),
  imei1 text NOT NULL,
  product_key text NOT NULL,
  unit_price numeric(12, 2),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX idx_sale_items_imei1 ON sale_items(imei1);

-- ============================================================
-- 6. Reservations (leads, deposits, waiting list)
-- ============================================================
CREATE TABLE reservations (
  id serial PRIMARY KEY,
  customer_id integer REFERENCES customers(id),
  manychat_id text,
  customer_name text,
  customer_phone text,
  product_key text NOT NULL REFERENCES products(product_key),
  requested_color text,
  status reservation_status NOT NULL DEFAULT 'interested',
  deposit_amount numeric(12, 2),
  deposit_date date,
  deposit_method payment_method,
  balance_due numeric(12, 2),
  stock_unit_id integer REFERENCES stock_units(id),
  source text DEFAULT 'whatsapp' CHECK (source IN ('whatsapp', 'presencial', 'web', 'n8n')),
  notes text,
  last_contact_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Prevent duplicate active reservations for same customer+product
CREATE UNIQUE INDEX idx_unique_active_reservation
  ON reservations (customer_phone, product_key)
  WHERE status NOT IN ('cancelled', 'delivered');

CREATE INDEX idx_reservations_customer_id ON reservations(customer_id);
CREATE INDEX idx_reservations_manychat_id ON reservations(manychat_id);
CREATE INDEX idx_reservations_product_key ON reservations(product_key);
CREATE INDEX idx_reservations_status ON reservations(status);

CREATE TRIGGER trg_reservations_updated
  BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 7. Stock Errors Log
-- ============================================================
CREATE TABLE stock_errors_log (
  id serial PRIMARY KEY,
  event text NOT NULL,
  severity error_severity NOT NULL DEFAULT 'medium',
  error_code text NOT NULL,
  message text,
  payload jsonb,
  resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_stock_errors_code ON stock_errors_log(error_code);
CREATE INDEX idx_stock_errors_resolved ON stock_errors_log(resolved);

-- ============================================================
-- 8. Function: Sell a unit by IMEI (atomic, with validation)
-- ============================================================
CREATE OR REPLACE FUNCTION sell_unit_by_imei(
  p_imei1 text,
  p_sale_id integer
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_unit stock_units%ROWTYPE;
  v_result jsonb;
BEGIN
  -- Find the unit
  SELECT * INTO v_unit FROM stock_units WHERE imei1 = p_imei1;

  IF NOT FOUND THEN
    INSERT INTO stock_errors_log (event, severity, error_code, message, payload)
    VALUES ('sell_unit', 'high', 'SALE_WITHOUT_STOCK',
            'IMEI not found in stock: ' || p_imei1,
            jsonb_build_object('imei1', p_imei1, 'sale_id', p_sale_id));
    RETURN jsonb_build_object('success', false, 'error', 'SALE_WITHOUT_STOCK');
  END IF;

  IF v_unit.status = 'sold' THEN
    INSERT INTO stock_errors_log (event, severity, error_code, message, payload)
    VALUES ('sell_unit', 'high', 'SALE_IMEI_ALREADY_SOLD',
            'IMEI already sold: ' || p_imei1,
            jsonb_build_object('imei1', p_imei1, 'sale_id', p_sale_id, 'existing_sale_id', v_unit.sale_id));
    RETURN jsonb_build_object('success', false, 'error', 'SALE_IMEI_ALREADY_SOLD');
  END IF;

  IF v_unit.status NOT IN ('in_stock', 'reserved') THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNIT_NOT_AVAILABLE', 'current_status', v_unit.status::text);
  END IF;

  UPDATE stock_units
  SET status = 'sold',
      sale_id = p_sale_id,
      date_sold = CURRENT_DATE,
      reserved_for_phone = NULL,
      reserved_for_customer_id = NULL,
      reserved_until = NULL,
      reservation_id = NULL
  WHERE imei1 = p_imei1;

  RETURN jsonb_build_object('success', true, 'imei1', p_imei1, 'product_key', v_unit.product_key);
END;
$$;

-- ============================================================
-- 9. Function: Reserve a unit for a customer
-- ============================================================
CREATE OR REPLACE FUNCTION reserve_unit(
  p_imei1 text,
  p_customer_phone text,
  p_customer_id integer DEFAULT NULL,
  p_reservation_id integer DEFAULT NULL,
  p_hours integer DEFAULT 48
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_unit stock_units%ROWTYPE;
BEGIN
  SELECT * INTO v_unit FROM stock_units WHERE imei1 = p_imei1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'IMEI_NOT_FOUND');
  END IF;

  IF v_unit.status != 'in_stock' THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNIT_NOT_AVAILABLE', 'current_status', v_unit.status::text);
  END IF;

  UPDATE stock_units
  SET status = 'reserved',
      reserved_for_phone = p_customer_phone,
      reserved_for_customer_id = p_customer_id,
      reserved_until = now() + (p_hours || ' hours')::interval,
      reservation_id = p_reservation_id
  WHERE imei1 = p_imei1;

  RETURN jsonb_build_object('success', true, 'imei1', p_imei1, 'reserved_until', (now() + (p_hours || ' hours')::interval)::text);
END;
$$;

-- ============================================================
-- 10. Function: Count available stock per product_key
-- ============================================================
CREATE OR REPLACE FUNCTION get_stock_count(p_product_key text)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::integer
  FROM stock_units
  WHERE product_key = p_product_key
    AND status = 'in_stock';
$$;

-- ============================================================
-- 11. View: Stock summary (for web dashboard)
-- ============================================================
CREATE OR REPLACE VIEW v_stock_summary AS
SELECT
  p.product_key,
  p.product_name,
  p.category,
  p.price_ars,
  p.promo_price_ars,
  p.price_usd,
  p.condition,
  COUNT(su.id) FILTER (WHERE su.status = 'in_stock') AS units_in_stock,
  COUNT(su.id) FILTER (WHERE su.status = 'reserved') AS units_reserved,
  COUNT(su.id) FILTER (WHERE su.status = 'sold') AS units_sold,
  COUNT(su.id) AS total_units
FROM products p
LEFT JOIN stock_units su ON su.product_key = p.product_key
GROUP BY p.product_key, p.product_name, p.category, p.price_ars,
         p.promo_price_ars, p.price_usd, p.condition;

-- ============================================================
-- 12. View: Active reservations (for web dashboard)
-- ============================================================
CREATE OR REPLACE VIEW v_active_reservations AS
SELECT
  r.id,
  r.customer_name,
  r.customer_phone,
  r.manychat_id,
  r.product_key,
  p.product_name,
  r.requested_color,
  r.status,
  r.deposit_amount,
  r.deposit_date,
  r.balance_due,
  r.source,
  r.notes,
  r.created_at,
  r.updated_at,
  COALESCE(
    (SELECT COUNT(*) FROM stock_units su
     WHERE su.product_key = r.product_key AND su.status = 'in_stock'),
    0
  ) AS available_stock
FROM reservations r
JOIN products p ON p.product_key = r.product_key
WHERE r.status NOT IN ('cancelled', 'delivered')
ORDER BY r.created_at DESC;

-- ============================================================
-- 13. View: Recent purchases (for web dashboard)
-- ============================================================
CREATE OR REPLACE VIEW v_recent_purchases AS
SELECT
  pu.id,
  pu.purchase_id,
  pu.date_purchase,
  pu.supplier_name,
  pu.payment_method,
  pu.payment_status,
  pu.total_cost,
  pu.currency,
  pu.notes,
  pu.created_by,
  pu.created_at,
  COUNT(su.id) AS unit_count
FROM purchases pu
LEFT JOIN stock_units su ON su.purchase_id = pu.purchase_id
GROUP BY pu.id
ORDER BY pu.date_purchase DESC;

-- ============================================================
-- 14. RLS Policies (permissive - web admin + n8n both need access)
-- ============================================================
ALTER TABLE stock_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_errors_log ENABLE ROW LEVEL SECURITY;

-- Allow full access (web admin uses anon key, n8n uses service_role)
CREATE POLICY "allow_all" ON stock_units FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON purchases FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON sales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON sale_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON reservations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON stock_errors_log FOR ALL USING (true) WITH CHECK (true);
