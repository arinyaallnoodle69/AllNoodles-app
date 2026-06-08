import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "All Noodles",
    short_name: "All Noodles",
    description:
      "ระบบจัดการธุรกิจจำหน่ายเส้นก๋วยเตี๋ยวและวัตถุดิบแบบดิจิทัล รองรับออเดอร์ จัดส่ง และรายงาน",
    start_url: "/login",
    scope: "/",
    display: "standalone",
    background_color: "#FAF7F2",
    theme_color: "#082A63",
    lang: "th",
    orientation: "portrait",
    icons: [
      {
        src: "/brand/192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/brand/180x182.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
