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
    serial_number BIGSERIAL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_address TEXT NOT NULL,
    items JSONB NOT NULL DEFAULT '[]',
    total NUMERIC(12, 2) NOT NULL DEFAULT 0,
    delivery_fee NUMERIC(12, 2) NOT NULL DEFAULT 0,
    delivery_duration TEXT DEFAULT '',
    delivery_time TEXT DEFAULT '',
    invoice_serial TEXT DEFAULT '',
    status order_status NOT NULL DEFAULT 'pending',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration Queries for existing tables
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_duration TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_time TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_serial TEXT DEFAULT '';

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
    user_id UUID,
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
    eye_protection BOOLEAN DEFAULT FALSE,
    whatsapp_link TEXT DEFAULT '',
    telegram_link TEXT DEFAULT '',
    messenger_link TEXT DEFAULT '',
    phone_link TEXT DEFAULT '07800000000',
    home_icon TEXT DEFAULT '',
    home_icon_size INTEGER DEFAULT 28,
    search_icon TEXT DEFAULT '',
    search_icon_size INTEGER DEFAULT 28,
    cart_icon TEXT DEFAULT '',
    cart_icon_size INTEGER DEFAULT 28,
    footer_height INTEGER DEFAULT 120,
    footer_right_text TEXT DEFAULT 'جميع الحقوق محفوظة © 2026 موقع أحمد بحري',
    footer_center_text TEXT DEFAULT 'أفضل المنتجات والخدمات لعملائنا الكرام',
    footer_left_text TEXT DEFAULT 'للطلب والتواصل: 07800000000',
    show_categories_carousel BOOLEAN DEFAULT TRUE,
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

CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    image TEXT DEFAULT '',
    priority INTEGER DEFAULT 1,
    display_order INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 1,
    keywords TEXT DEFAULT '',
    views INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hero_gallery (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    position INTEGER NOT NULL CHECK (position >= 0 AND position < 10),
    image_url TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visitor_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    phone TEXT DEFAULT '',
    city TEXT DEFAULT '',
    governorate TEXT DEFAULT '',
    address TEXT DEFAULT '',
    email TEXT DEFAULT '',
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    device_type TEXT DEFAULT 'Desktop',
    visit_count INTEGER DEFAULT 1,
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    visited_pages JSONB DEFAULT '[]',
    is_blocked BOOLEAN DEFAULT FALSE,
    is_registered BOOLEAN DEFAULT FALSE,
    notes TEXT DEFAULT '',
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
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    user_role_val public.user_role := 'customer';
BEGIN
    BEGIN
        IF NEW.raw_user_meta_data->>'role' = 'admin' THEN
            user_role_val := 'admin';
        ELSIF NEW.raw_user_meta_data->>'role' = 'manager' THEN
            user_role_val := 'manager';
        ELSE
            user_role_val := 'customer';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        user_role_val := 'customer';
    END;

    INSERT INTO public.users (id, email, full_name, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.email, ''),
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        user_role_val
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        updated_at = NOW();

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

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
-- =====================
-- 9.5 Helper Functions for RLS (Prevents Policy Recursion)
-- =====================

CREATE OR REPLACE FUNCTION public.is_manager_or_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND (role = 'manager' OR role = 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'manager'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.is_manager_or_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_manager() TO authenticated, anon;

-- =====================
-- 10. RLS Policies
-- =====================

DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Managers can view all users" ON users;
DROP POLICY IF EXISTS "Managers can update all users" ON users;
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Admins can update all users" ON users;
DROP POLICY IF EXISTS "Managers and Admins can update users" ON users;
DROP POLICY IF EXISTS "Managers and Admins can insert users" ON users;

CREATE POLICY "Users can view own profile" ON users FOR SELECT USING (auth.uid() = id OR public.is_manager_or_admin());
CREATE POLICY "Managers and Admins can update users" ON users FOR UPDATE USING (public.is_manager_or_admin());
CREATE POLICY "Managers and Admins can insert users" ON users FOR INSERT WITH CHECK (public.is_manager_or_admin() OR auth.uid() = id);

DROP POLICY IF EXISTS "Anyone can view products" ON products;
DROP POLICY IF EXISTS "Managers can manage products" ON products;
DROP POLICY IF EXISTS "Admins can insert products" ON products;
DROP POLICY IF EXISTS "Admins can update products" ON products;
DROP POLICY IF EXISTS "Managers and Admins can manage products" ON products;

CREATE POLICY "Anyone can view products" ON products FOR SELECT USING (TRUE);
CREATE POLICY "Managers and Admins can manage products" ON products FOR ALL USING (public.is_manager_or_admin());

DROP POLICY IF EXISTS "Anyone can view suppliers" ON suppliers;
DROP POLICY IF EXISTS "Managers can manage suppliers" ON suppliers;
DROP POLICY IF EXISTS "Managers and Admins can manage suppliers" ON suppliers;

CREATE POLICY "Anyone can view suppliers" ON suppliers FOR SELECT USING (TRUE);
CREATE POLICY "Managers and Admins can manage suppliers" ON suppliers FOR ALL USING (public.is_manager_or_admin());

DROP POLICY IF EXISTS "Anyone can create orders" ON orders;
DROP POLICY IF EXISTS "Managers can view all orders" ON orders;
DROP POLICY IF EXISTS "Admins can view orders" ON orders;
DROP POLICY IF EXISTS "Managers can update orders" ON orders;
DROP POLICY IF EXISTS "Managers and Admins can view orders" ON orders;
DROP POLICY IF EXISTS "Managers and Admins can update orders" ON orders;

CREATE POLICY "Anyone can create orders" ON orders FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Managers and Admins can view orders" ON orders FOR SELECT USING (public.is_manager_or_admin());
CREATE POLICY "Managers and Admins can update orders" ON orders FOR UPDATE USING (public.is_manager_or_admin());

DROP POLICY IF EXISTS "Managers can view sales" ON sales;
DROP POLICY IF EXISTS "System can insert sales" ON sales;
DROP POLICY IF EXISTS "Managers and Admins can view sales" ON sales;
DROP POLICY IF EXISTS "System and Admins can insert sales" ON sales;

CREATE POLICY "Managers and Admins can view sales" ON sales FOR SELECT USING (public.is_manager_or_admin());
CREATE POLICY "System and Admins can insert sales" ON sales FOR INSERT WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Managers can view activity" ON activity_log;
DROP POLICY IF EXISTS "System can insert activity" ON activity_log;
DROP POLICY IF EXISTS "Managers and Admins can view activity" ON activity_log;

CREATE POLICY "Managers and Admins can view activity" ON activity_log FOR SELECT USING (public.is_manager_or_admin());
CREATE POLICY "System can insert activity" ON activity_log FOR INSERT WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Managers can manage trash" ON trash;
DROP POLICY IF EXISTS "Managers and Admins can manage trash" ON trash;

CREATE POLICY "Managers and Admins can manage trash" ON trash FOR ALL USING (public.is_manager_or_admin());

DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "System can insert notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY "System can insert notifications" ON notifications FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE USING (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can view own settings" ON settings;
DROP POLICY IF EXISTS "Users can insert own settings" ON settings;
DROP POLICY IF EXISTS "Users can update own settings" ON settings;
DROP POLICY IF EXISTS "Anyone can view settings" ON settings;
CREATE POLICY "Anyone can view settings" ON settings FOR SELECT USING (TRUE);
CREATE POLICY "Users can insert own settings" ON settings FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Users can update own settings" ON settings FOR UPDATE USING (TRUE);

DROP POLICY IF EXISTS "Anyone can view active cards" ON chat_cards;
DROP POLICY IF EXISTS "Managers can manage cards" ON chat_cards;
DROP POLICY IF EXISTS "Managers and Admins can manage cards" ON chat_cards;

CREATE POLICY "Anyone can view active cards" ON chat_cards FOR SELECT USING (is_active = TRUE OR public.is_manager_or_admin());
CREATE POLICY "Managers and Admins can manage cards" ON chat_cards FOR ALL USING (public.is_manager_or_admin());

DROP POLICY IF EXISTS "Public read hero gallery" ON hero_gallery;
DROP POLICY IF EXISTS "Authenticated insert hero gallery" ON hero_gallery;
DROP POLICY IF EXISTS "Authenticated update hero gallery" ON hero_gallery;
DROP POLICY IF EXISTS "Authenticated delete hero gallery" ON hero_gallery;
CREATE POLICY "Public read hero gallery" ON hero_gallery FOR SELECT USING (true);
CREATE POLICY "Authenticated insert hero gallery" ON hero_gallery FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update hero gallery" ON hero_gallery FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated delete hero gallery" ON hero_gallery FOR DELETE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Anyone can view categories" ON categories;
DROP POLICY IF EXISTS "Anyone can manage categories" ON categories;
CREATE POLICY "Anyone can view categories" ON categories FOR SELECT USING (TRUE);
CREATE POLICY "Anyone can manage categories" ON categories FOR ALL USING (TRUE);

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
GRANT ALL ON categories TO authenticated;
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
GRANT SELECT ON categories TO anon;
GRANT SELECT ON hero_gallery TO anon;
