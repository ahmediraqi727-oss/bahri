import { supabase } from "@/lib/supabase-client";

export async function updateStoreSettings(formData: {
  address: string;
  map_url: string;
  phone_primary: string;
  phone_secondary: string;
  whatsapp: string;
  facebook: string;
  instagram: string;
  tiktok: string;
}) {
  const { error } = await supabase
    .from("settings")
    .update({
      address: formData.address,
      map_url: formData.map_url,
      phone_primary: formData.phone_primary,
      phone_secondary: formData.phone_secondary,
      whatsapp: formData.whatsapp,
      facebook: formData.facebook,
      instagram: formData.instagram,
      tiktok: formData.tiktok,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1); // assuming settings stored in row 1

  if (error) {
    console.error("Error updating settings:", error.message);
    return { success: false, error: error.message };
  }

  return { success: true };
}
