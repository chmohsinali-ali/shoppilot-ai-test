import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "Missing Supabase env vars" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    let notificationsCreated = 0;

    // 1. Low stock alerts
    const { data: lowStockProducts } = await supabase
      .from("products")
      .select("id, shop_id, name, stock, min_stock_level, unit")
      .is("deleted_at", null);

    for (const p of lowStockProducts ?? []) {
      const minLevel = Number(p.min_stock_level);
      if (minLevel > 0 && Number(p.stock) <= minLevel) {
        const { data: existing } = await supabase
          .from("notifications")
          .select("id")
          .eq("shop_id", p.shop_id)
          .eq("entity_type", "product")
          .eq("entity_id", p.id)
          .eq("type", "warning")
          .ilike("title", `%${p.name}%`)
          .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .limit(1);

        if (!existing || existing.length === 0) {
          await supabase.from("notifications").insert({
            shop_id: p.shop_id,
            type: "warning",
            title: `Low stock: ${p.name}`,
            message: `${p.name} is at ${p.stock} ${p.unit} (minimum: ${minLevel} ${p.unit}). Consider reordering.`,
            entity_type: "product",
            entity_id: p.id,
          });
          notificationsCreated++;
        }
      }
    }

    // 2. Warranty expiring soon (within 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const today = new Date().toISOString().slice(0, 10);
    const expiryThreshold = thirtyDaysFromNow.toISOString().slice(0, 10);

    const { data: expiringWarranties } = await supabase
      .from("warranties")
      .select("id, shop_id, product_name, customer_name, warranty_expiry_date, warranty_number")
      .eq("status", "active")
      .gte("warranty_expiry_date", today)
      .lte("warranty_expiry_date", expiryThreshold);

    for (const w of expiringWarranties ?? []) {
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("shop_id", w.shop_id)
        .eq("entity_type", "warranty")
        .eq("entity_id", w.id)
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabase.from("notifications").insert({
          shop_id: w.shop_id,
          type: "reminder",
          title: `Warranty expiring: ${w.product_name}`,
          message: `Warranty ${w.warranty_number} for ${w.customer_name ?? "customer"} expires on ${w.warranty_expiry_date}.`,
          entity_type: "warranty",
          entity_id: w.id,
        });
        notificationsCreated++;
      }
    }

    // 3. Customer overdue payments (balance > 0 with no recent payment)
    const { data: shops } = await supabase.from("shops").select("id, name");
    for (const shop of shops ?? []) {
      // Get customers with positive balance
      const { data: customers } = await supabase
        .from("customers")
        .select("id, full_name, primary_phone")
        .eq("shop_id", shop.id)
        .eq("status", "active")
        .is("deleted_at", null);

      for (const c of customers ?? []) {
        const { data: balance } = await supabase.rpc("get_customer_balance", { p_customer_id: c.id });
        const bal = Number(balance ?? 0);
        if (bal > 0) {
          // Check if there's a notification in the last 7 days
          const { data: existing } = await supabase
            .from("notifications")
            .select("id")
            .eq("shop_id", shop.id)
            .eq("entity_type", "customer")
            .eq("entity_id", c.id)
            .eq("type", "reminder")
            .ilike("title", `%overdue%`)
            .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
            .limit(1);

          if (!existing || existing.length === 0) {
            await supabase.from("notifications").insert({
              shop_id: shop.id,
              type: "reminder",
              title: `Payment overdue: ${c.full_name}`,
              message: `${c.full_name} has an outstanding balance of ${bal.toFixed(2)}. ${c.primary_phone ? `Phone: ${c.primary_phone}` : ""}`,
              entity_type: "customer",
              entity_id: c.id,
            });
            notificationsCreated++;
          }
        }
      }
    }

    // 4. Daily closing not done
    const todayDate = new Date().toISOString().slice(0, 10);
    for (const shop of shops ?? []) {
      const { data: closing } = await supabase
        .from("daily_closings")
        .select("id")
        .eq("shop_id", shop.id)
        .eq("closing_date", todayDate)
        .limit(1);

      if (!closing || closing.length === 0) {
        const hour = new Date().getHours();
        if (hour >= 20) { // After 8 PM, remind
          const { data: existing } = await supabase
            .from("notifications")
            .select("id")
            .eq("shop_id", shop.id)
            .eq("type", "reminder")
            .ilike("title", "%daily closing%")
            .eq("is_read", false)
            .gte("created_at", new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString())
            .limit(1);

          if (!existing || existing.length === 0) {
            await supabase.from("notifications").insert({
              shop_id: shop.id,
              type: "reminder",
              title: "Daily closing pending",
              message: `Today's daily closing has not been completed. Please reconcile cash before end of day.`,
              entity_type: "daily_closing",
            });
            notificationsCreated++;
          }
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      notificationsCreated,
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
