-- ============================================================
-- موقع أحمد بحري - إعداد شامل لجميع الجداول
-- شغّل هذا الملف في Supabase SQL Editor
-- ============================================================

-- =====================
-- 1. Extensions
-- =====================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================
-- 2. Custom Types
-- =====================
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('manager', 'admin', 'customer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE trash_entity AS ENUM ('product', 'supplier', 'order', 'customer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE activity_action AS ENUM ('create', 'update', 'delete', 'restore', 'login', 'export', 'import');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM ('low_stock', 'out_of_stock', 'info');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =====================
-- 3. Tables
-- =====================

CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    address TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL DEFAULT '',
    role user_role NOT NULL DEFAULT 'customer',
    phone TEXT DEFAULT '',
    avatar_url TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    image TEXT DEFAULT '',
    cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
    wholesale_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
    profit_margin NUMERIC(5, 2) NOT NULL DEFAULT 0,
    retail_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_address TEXT NOT NULL,
    items JSONB NOT NULL DEFAULT '[]',
    total NUMERIC(12, 2) NOT NULL DEFAULT 0,
    status order_status NOT NULL DEFAULT 'pending',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    items JSONB NOT NULL DEFAULT '[]',
    total NUMERIC(12, 2) NOT NULL DEFAULT 0,
    cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
    profit NUMERIC(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_role user_role NOT NULL,
    action activity_action NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT DEFAULT '',
    details TEXT NOT NULL DEFAULT '',
    old_value TEXT DEFAULT '',
    new_value TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trash (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity trash_entity NOT NULL,
    entity_id UUID NOT NULL,
    entity_name TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',
    deleted_by TEXT NOT NULL DEFAULT '',
    deleted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type notification_type NOT NULL DEFAULT 'info',
    title TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    product_id TEXT DEFAULT '',
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    site_name TEXT DEFAULT 'موقع أحمد بحري',
    logo TEXT DEFAULT '',
    hero_image TEXT DEFAULT '',
    footer_image TEXT DEFAULT '',
    font_family TEXT DEFAULT 'Cairo',
    font_size INTEGER DEFAULT 16,
    primary_color TEXT DEFAULT '#2563eb',
    secondary_color TEXT DEFAULT '#7c3aed',
    accent_color TEXT DEFAULT '#f59e0b',
    dark_mode BOOLEAN DEFAULT FALSE,
    role_themes JSONB DEFAULT '{
        "manager": {"primary": "#1e40af", "secondary": "#7c3aed", "accent": "#f59e0b"},
        "admin": {"primary": "#059669", "secondary": "#0891b2", "accent": "#f97316"},
        "customer": {"primary": "#2563eb", "secondary": "#6366f1", "accent": "#ec4899"}
    }',
    admin_permissions JSONB DEFAULT '[]',
    inventory_thresholds JSONB DEFAULT '{"excellent": 75, "medium": 40}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    category TEXT DEFAULT 'general',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hero_gallery (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    position INTEGER NOT NULL CHECK (position >= 0 AND position < 10),
    image_url TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================
-- 4. Indexes
-- =====================
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_customer_phone ON sales(customer_phone);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity);
CREATE INDEX IF NOT EXISTS idx_trash_deleted ON trash(deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hero_gallery_position ON hero_gallery(position);

-- =====================
-- 5. Auth Trigger
-- =====================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'customer')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =====================
-- 6. Price Trigger
-- =====================
CREATE OR REPLACE FUNCTION calculate_retail_price()
RETURNS TRIGGER AS $$
BEGIN
    NEW.retail_price := NEW.cost_price + (NEW.cost_price * NEW.profit_margin / 100);
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calculate_retail_price ON products;
CREATE TRIGGER trigger_calculate_retail_price
    BEFORE INSERT OR UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION calculate_retail_price();

-- =====================
-- 7. updated_at Triggers
-- =====================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_users_updated_at ON users;
CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_orders_updated_at ON orders;
CREATE TRIGGER trigger_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_settings_updated_at ON settings;
CREATE TRIGGER trigger_settings_updated_at
    BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================
-- 8. Trash Purge Function
-- =====================
CREATE OR REPLACE FUNCTION purge_expired_trash()
RETURNS INTEGER AS $$
DECLARE deleted_count INTEGER;
BEGIN
    DELETE FROM trash WHERE deleted_at < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================
-- 9. Enable RLS
-- =====================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE trash ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE hero_gallery ENABLE ROW LEVEL SECURITY;

-- =====================
-- 10. RLS Policies
-- =====================

DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Managers can view all users" ON users;
DROP POLICY IF EXISTS "Managers can update all users" ON users;
CREATE POLICY "Users can view own profile" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Managers can view all users" ON users FOR SELECT USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager'));
CREATE POLICY "Managers can update all users" ON users FOR UPDATE USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager'));

DROP POLICY IF EXISTS "Anyone can view products" ON products;
DROP POLICY IF EXISTS "Managers can manage products" ON products;
DROP POLICY IF EXISTS "Admins can insert products" ON products;
DROP POLICY IF EXISTS "Admins can update products" ON products;
CREATE POLICY "Anyone can view products" ON products FOR SELECT USING (TRUE);
CREATE POLICY "Managers can manage products" ON products FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager'));
CREATE POLICY "Admins can insert products" ON products FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can update products" ON products FOR UPDATE USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Anyone can view suppliers" ON suppliers;
DROP POLICY IF EXISTS "Managers can manage suppliers" ON suppliers;
CREATE POLICY "Anyone can view suppliers" ON suppliers FOR SELECT USING (TRUE);
CREATE POLICY "Managers can manage suppliers" ON suppliers FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager'));

DROP POLICY IF EXISTS "Anyone can create orders" ON orders;
DROP POLICY IF EXISTS "Managers can view all orders" ON orders;
DROP POLICY IF EXISTS "Admins can view orders" ON orders;
DROP POLICY IF EXISTS "Managers can update orders" ON orders;
CREATE POLICY "Anyone can create orders" ON orders FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Managers can view all orders" ON orders FOR SELECT USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager'));
CREATE POLICY "Admins can view orders" ON orders FOR SELECT USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Managers can update orders" ON orders FOR UPDATE USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager'));

DROP POLICY IF EXISTS "Managers can view sales" ON sales;
DROP POLICY IF EXISTS "System can insert sales" ON sales;
CREATE POLICY "Managers can view sales" ON sales FOR SELECT USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager'));
CREATE POLICY "System can insert sales" ON sales FOR INSERT WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Managers can view activity" ON activity_log;
DROP POLICY IF EXISTS "System can insert activity" ON activity_log;
CREATE POLICY "Managers can view activity" ON activity_log FOR SELECT USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager'));
CREATE POLICY "System can insert activity" ON activity_log FOR INSERT WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Managers can manage trash" ON trash;
CREATE POLICY "Managers can manage trash" ON trash FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager'));

DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "System can insert notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY "System can insert notifications" ON notifications FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE USING (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can view own settings" ON settings;
DROP POLICY IF EXISTS "Users can update own settings" ON settings;
CREATE POLICY "Users can view own settings" ON settings FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own settings" ON settings FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own settings" ON settings FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Anyone can view active cards" ON chat_cards;
DROP POLICY IF EXISTS "Managers can manage cards" ON chat_cards;
CREATE POLICY "Anyone can view active cards" ON chat_cards FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Managers can manage cards" ON chat_cards FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager'));

DROP POLICY IF EXISTS "Public read hero gallery" ON hero_gallery;
DROP POLICY IF EXISTS "Authenticated insert hero gallery" ON hero_gallery;
DROP POLICY IF EXISTS "Authenticated update hero gallery" ON hero_gallery;
DROP POLICY IF EXISTS "Authenticated delete hero gallery" ON hero_gallery;
CREATE POLICY "Public read hero gallery" ON hero_gallery FOR SELECT USING (true);
CREATE POLICY "Authenticated insert hero gallery" ON hero_gallery FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update hero gallery" ON hero_gallery FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated delete hero gallery" ON hero_gallery FOR DELETE USING (auth.role() = 'authenticated');

-- =====================
-- 11. Storage Buckets
-- =====================
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('site-assets', 'site-assets', true) ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN CREATE POLICY "Anyone can view product images" ON storage.objects FOR SELECT USING (bucket_id = 'product-images'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Authenticated can upload product images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'product-images' AND auth.role() = 'authenticated'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Anyone can view site assets" ON storage.objects FOR SELECT USING (bucket_id = 'site-assets'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Authenticated can upload site assets" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'site-assets' AND auth.role() = 'authenticated'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Authenticated can delete site assets" ON storage.objects FOR DELETE USING (bucket_id = 'site-assets' AND auth.role() = 'authenticated'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================
-- 12. GRANT Permissions
-- =====================
GRANT ALL ON users TO authenticated;
GRANT ALL ON products TO authenticated;
GRANT ALL ON suppliers TO authenticated;
GRANT ALL ON orders TO authenticated;
GRANT ALL ON sales TO authenticated;
GRANT ALL ON activity_log TO authenticated;
GRANT ALL ON trash TO authenticated;
GRANT ALL ON notifications TO authenticated;
GRANT ALL ON settings TO authenticated;
GRANT ALL ON chat_cards TO authenticated;
GRANT ALL ON hero_gallery TO authenticated;
GRANT SELECT ON products TO anon;
GRANT SELECT ON suppliers TO anon;
GRANT SELECT ON hero_gallery TO anon;
