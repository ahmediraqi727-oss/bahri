export interface FooterZoneConfig {
  enabled: boolean;
  title: string;
  text: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  linkUrl: string;
  fontSize: number;
}

export interface FooterFullWidthConfig {
  enabled: boolean;
  title: string;
  text: string;
  bgColor: string;
  textColor: string;
  fontSize: number;
}

export interface FooterSettings {
  id: number;
  footerMinHeight: number;
  containerPaddingY: number;
  containerPaddingX: number;
  
  right: FooterZoneConfig;
  center: FooterZoneConfig;
  left: FooterZoneConfig;
  fullWidth: FooterFullWidthConfig;
  
  showSocialLinks: boolean;
  showStoreLocationLink: boolean;
  showAppDownloadLinks: boolean;
  
  updatedAt?: string;
}

export const DEFAULT_FOOTER_SETTINGS: FooterSettings = {
  id: 1,
  footerMinHeight: 160,
  containerPaddingY: 32,
  containerPaddingX: 16,
  
  right: {
    enabled: true,
    title: "عن المتجر",
    text: "جميع الحقوق محفوظة © 2026 متجر أحمد بحري - تجارة جملة ومفرد لقطع غيار الدراجات النارية والدراجات الكهربائية",
    imageUrl: "",
    imageWidth: 120,
    imageHeight: 40,
    linkUrl: "",
    fontSize: 14,
  },
  
  center: {
    enabled: true,
    title: "رسالتنا وخدماتنا",
    text: "أفضل المنتجات والخدمات لعملائنا الكرام بأعلى جودة وأفضل الأسعار في كركوك وكافة المحافظات",
    imageUrl: "",
    imageWidth: 100,
    imageHeight: 48,
    linkUrl: "",
    fontSize: 14,
  },
  
  left: {
    enabled: true,
    title: "الطلب والتواصل",
    text: "للطلب والتواصل المباشر: 07800000000",
    imageUrl: "",
    imageWidth: 120,
    imageHeight: 40,
    linkUrl: "tel:07800000000",
    fontSize: 14,
  },
  
  fullWidth: {
    enabled: false,
    title: "إرشادات وشروط الشراء بالجملة",
    text: "تخفيضات خاصة وخصومات تصاعدية على الكميات الكبيرة لأصحاب المحلات والورش في كافة المحافظات العراقية. تواصل معنا للحصول على قائمة الأسعار الرسمية.",
    bgColor: "#1e293b",
    textColor: "#ffffff",
    fontSize: 13,
  },
  
  showSocialLinks: true,
  showStoreLocationLink: true,
  showAppDownloadLinks: true,
};

/** Helper to convert Supabase row to typed FooterSettings */
export function rowToFooterSettings(row: Record<string, any>): FooterSettings {
  if (!row) return DEFAULT_FOOTER_SETTINGS;

  return {
    id: Number(row.id) || 1,
    footerMinHeight: Number(row.footer_min_height) || 160,
    containerPaddingY: Number(row.container_padding_y) || 32,
    containerPaddingX: Number(row.container_padding_x) || 16,

    right: {
      enabled: row.right_enabled !== undefined ? Boolean(row.right_enabled) : true,
      title: row.right_title || DEFAULT_FOOTER_SETTINGS.right.title,
      text: row.right_text || DEFAULT_FOOTER_SETTINGS.right.text,
      imageUrl: row.right_image_url || "",
      imageWidth: Number(row.right_image_width) || 120,
      imageHeight: Number(row.right_image_height) || 40,
      linkUrl: row.right_link_url || "",
      fontSize: Number(row.right_font_size) || 14,
    },

    center: {
      enabled: row.center_enabled !== undefined ? Boolean(row.center_enabled) : true,
      title: row.center_title || DEFAULT_FOOTER_SETTINGS.center.title,
      text: row.center_text || DEFAULT_FOOTER_SETTINGS.center.text,
      imageUrl: row.center_image_url || "",
      imageWidth: Number(row.center_image_width) || 100,
      imageHeight: Number(row.center_image_height) || 48,
      linkUrl: row.center_link_url || "",
      fontSize: Number(row.center_font_size) || 14,
    },

    left: {
      enabled: row.left_enabled !== undefined ? Boolean(row.left_enabled) : true,
      title: row.left_title || DEFAULT_FOOTER_SETTINGS.left.title,
      text: row.left_text || DEFAULT_FOOTER_SETTINGS.left.text,
      imageUrl: row.left_image_url || "",
      imageWidth: Number(row.left_image_width) || 120,
      imageHeight: Number(row.left_image_height) || 40,
      linkUrl: row.left_link_url || "tel:07800000000",
      fontSize: Number(row.left_font_size) || 14,
    },

    fullWidth: {
      enabled: row.full_width_enabled !== undefined ? Boolean(row.full_width_enabled) : false,
      title: row.full_width_title || DEFAULT_FOOTER_SETTINGS.fullWidth.title,
      text: row.full_width_text || DEFAULT_FOOTER_SETTINGS.fullWidth.text,
      bgColor: row.full_width_bg_color || "#1e293b",
      textColor: row.full_width_text_color || "#ffffff",
      fontSize: Number(row.full_width_font_size) || 13,
    },

    showSocialLinks: row.show_social_links !== undefined ? Boolean(row.show_social_links) : true,
    showStoreLocationLink: row.show_store_location_link !== undefined ? Boolean(row.show_store_location_link) : true,
    showAppDownloadLinks: row.show_app_download_links !== undefined ? Boolean(row.show_app_download_links) : true,

    updatedAt: row.updated_at || undefined,
  };
}

/** Helper to convert typed FooterSettings to Supabase row payload */
export function footerSettingsToRow(fs: FooterSettings): Record<string, any> {
  return {
    id: fs.id || 1,
    footer_min_height: fs.footerMinHeight,
    container_padding_y: fs.containerPaddingY,
    container_padding_x: fs.containerPaddingX,

    right_enabled: fs.right.enabled,
    right_title: fs.right.title,
    right_text: fs.right.text,
    right_image_url: fs.right.imageUrl,
    right_image_width: fs.right.imageWidth,
    right_image_height: fs.right.imageHeight,
    right_link_url: fs.right.linkUrl,
    right_font_size: fs.right.fontSize,

    center_enabled: fs.center.enabled,
    center_title: fs.center.title,
    center_text: fs.center.text,
    center_image_url: fs.center.imageUrl,
    center_image_width: fs.center.imageWidth,
    center_image_height: fs.center.imageHeight,
    center_link_url: fs.center.linkUrl,
    center_font_size: fs.center.fontSize,

    left_enabled: fs.left.enabled,
    left_title: fs.left.title,
    left_text: fs.left.text,
    left_image_url: fs.left.imageUrl,
    left_image_width: fs.left.imageWidth,
    left_image_height: fs.left.imageHeight,
    left_link_url: fs.left.linkUrl,
    left_font_size: fs.left.fontSize,

    full_width_enabled: fs.fullWidth.enabled,
    full_width_title: fs.fullWidth.title,
    full_width_text: fs.fullWidth.text,
    full_width_bg_color: fs.fullWidth.bgColor,
    full_width_text_color: fs.fullWidth.textColor,
    full_width_font_size: fs.fullWidth.fontSize,

    show_social_links: fs.showSocialLinks,
    show_store_location_link: fs.showStoreLocationLink,
    show_app_download_links: fs.showAppDownloadLinks,

    updated_at: new Date().toISOString(),
  };
}
