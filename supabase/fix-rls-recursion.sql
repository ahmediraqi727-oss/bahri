-- ==============================================================================
-- FIX: Infinite Recursion Detected in Policy for Relation "users"
-- ==============================================================================
-- Description:
-- Fixes RLS circular policy recursion by introducing SECURITY DEFINER helper
-- functions (public.is_manager_or_admin(), public.is_admin(), public.is_manager())
-- that safely query user roles without triggering RLS re-evaluation.
-- ==============================================================================

-- 1. Create SECURITY DEFINER helper functions to bypass RLS recursion
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

-- Grant EXECUTE permission to authenticated users
GRANT EXECUTE ON FUNCTION public.is_manager_or_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_manager() TO authenticated, anon;

-- 2. Drop existing self-referencing policies on users table
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Managers can view all users" ON users;
DROP POLICY IF EXISTS "Managers can update all users" ON users;
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Admins can update all users" ON users;

-- Re-create users table RLS policies safely using SECURITY DEFINER functions
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id OR public.is_manager_or_admin());

CREATE POLICY "Managers and Admins can update users" ON users
  FOR UPDATE USING (public.is_manager_or_admin());

CREATE POLICY "Managers and Admins can insert users" ON users
  FOR INSERT WITH CHECK (public.is_manager_or_admin() OR auth.uid() = id);

-- 3. Drop & Re-create products table policies
DROP POLICY IF EXISTS "Anyone can view products" ON products;
DROP POLICY IF EXISTS "Managers can manage products" ON products;
DROP POLICY IF EXISTS "Admins can insert products" ON products;
DROP POLICY IF EXISTS "Admins can update products" ON products;

CREATE POLICY "Anyone can view products" ON products
  FOR SELECT USING (TRUE);

CREATE POLICY "Managers and Admins can manage products" ON products
  FOR ALL USING (public.is_manager_or_admin());

-- 4. Drop & Re-create suppliers table policies
DROP POLICY IF EXISTS "Anyone can view suppliers" ON suppliers;
DROP POLICY IF EXISTS "Managers can manage suppliers" ON suppliers;

CREATE POLICY "Anyone can view suppliers" ON suppliers
  FOR SELECT USING (TRUE);

CREATE POLICY "Managers and Admins can manage suppliers" ON suppliers
  FOR ALL USING (public.is_manager_or_admin());

-- 5. Drop & Re-create orders table policies
DROP POLICY IF EXISTS "Anyone can create orders" ON orders;
DROP POLICY IF EXISTS "Managers can view all orders" ON orders;
DROP POLICY IF EXISTS "Admins can view orders" ON orders;
DROP POLICY IF EXISTS "Managers can update orders" ON orders;

CREATE POLICY "Anyone can create orders" ON orders
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Managers and Admins can view orders" ON orders
  FOR SELECT USING (public.is_manager_or_admin());

CREATE POLICY "Managers and Admins can update orders" ON orders
  FOR UPDATE USING (public.is_manager_or_admin());

-- 6. Drop & Re-create sales table policies
DROP POLICY IF EXISTS "Managers can view sales" ON sales;
DROP POLICY IF EXISTS "System can insert sales" ON sales;

CREATE POLICY "Managers and Admins can view sales" ON sales
  FOR SELECT USING (public.is_manager_or_admin());

CREATE POLICY "System and Admins can insert sales" ON sales
  FOR INSERT WITH CHECK (TRUE);

-- 7. Drop & Re-create activity_log table policies
DROP POLICY IF EXISTS "Managers can view activity" ON activity_log;
DROP POLICY IF EXISTS "System can insert activity" ON activity_log;

CREATE POLICY "Managers and Admins can view activity" ON activity_log
  FOR SELECT USING (public.is_manager_or_admin());

CREATE POLICY "System can insert activity" ON activity_log
  FOR INSERT WITH CHECK (TRUE);

-- 8. Drop & Re-create trash table policies
DROP POLICY IF EXISTS "Managers can manage trash" ON trash;

CREATE POLICY "Managers and Admins can manage trash" ON trash
  FOR ALL USING (public.is_manager_or_admin());

-- 9. Drop & Re-create chat_cards table policies
DROP POLICY IF EXISTS "Anyone can view active cards" ON chat_cards;
DROP POLICY IF EXISTS "Managers can manage cards" ON chat_cards;

CREATE POLICY "Anyone can view active cards" ON chat_cards
  FOR SELECT USING (is_active = TRUE OR public.is_manager_or_admin());

CREATE POLICY "Managers and Admins can manage cards" ON chat_cards
  FOR ALL USING (public.is_manager_or_admin());
